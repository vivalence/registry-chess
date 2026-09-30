import { v, Vector } from "@vivalence/typology";

// the coach's tools: deterministic reads over the boards, the corpus and the engine — a live board,
// the games played, one game, its analysis, a puzzle and its solution. no model runs here. they are
// armed in the coach's OWN harness only (harness.js); what the coach offers a game is its skills.

const domain = (ctx, door, path, input) => ctx.daemon.call[door][path]({ ...ctx, input, output: undefined });

const GAME = v.string().desc("A game literal's id or slug — from coach_games, or a finished match's `game`. Example: \"01JQ…\".");
const PUZZLE = v.string().desc("A puzzle literal's id or slug — a riddle buffer carries it as puzzle.id. Example: \"01JQ…\".");

const numbered = (sans) => sans.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san)).join(" ");

export const record = async (ctx, game) => {
  const literal = ctx.daemon.entities.literal;
  const row = await literal.findOneOrFail(literal.reference(game));
  const recorded = row.trait.RECORDED;
  const line = await domain(ctx, "rules", "replay", { moves: recorded.moves, ...(recorded.initial && { fen: recorded.initial }), ...(recorded.variant && { variant: recorded.variant }) });
  return { row, recorded, sans: line.plies.map((ply) => ply.san), analysed: row.trait.ANALYSED ?? null };
};

// drain the domain's streaming analysis; the last record carries the report
export const analyse = async (ctx, input) => {
  let last = null;
  for await (const progress of await domain(ctx, "analysis", "game", input)) last = progress;
  return last?.report ?? null;
};

export const moments = (report, limit = 6) =>
  report.judgements
    .filter((judgement) => ["inaccuracy", "mistake", "blunder"].includes(judgement.judgement))
    .sort((left, right) => right.loss - left.loss)
    .slice(0, limit)
    .sort((left, right) => left.ply - right.ply);

const summary = (report) =>
  [
    `Accuracy: white ${report.accuracy.white} · black ${report.accuracy.black} (engine ${report.engine}, depth ${report.depth}).`,
    ...moments(report).map((judgement) =>
      `Ply ${judgement.ply} ${judgement.san}: ${judgement.judgement}, ${judgement.loss}% win chance lost${judgement.best ? ` — the engine preferred ${judgement.best}` : ""}.`,
    ),
  ].join("\n");

// a board's buffer read without knowing whose mode it is: a match or a riddle, as it stands
export const position = (buffer) => {
  const data = buffer.data ?? {};
  const fen = data.shown?.fen ?? data.fen ?? data.puzzle?.fen ?? null;
  return { fen, sans: data.sans ?? [], seats: data.seats ?? null, status: data.status ?? null, puzzle: data.puzzle?.id ?? null };
};

export const tools = new Vector()
  .open(
    {
      nature: "/board",
      valence: "A board as it stands — a match or a riddle: the position, the moves so far, who sits, the legal moves and the engine's top lines there (never on a riddle still being solved — the lines are its answer). Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: v.string().desc("A board's buffer id. Example: \"01JQ…\".") }),
    },
    async (ctx) => {
      const buffer = await ctx.daemon.entities.buffer.findOneOrFail({ id: ctx.input.buffer });
      const read = position(buffer);
      if (!read.fen) return { condition: "ERROR", message: `buffer ${buffer.id} holds no position` };
      const legal = await domain(ctx, "rules", "legal", { fen: read.fen });
      return {
        buffer: buffer.id,
        ...read,
        message: [
          read.seats ? `White: ${read.seats.white.kind} · black: ${read.seats.black.kind} · ${read.status}.` : read.puzzle ? `Riddle ${read.puzzle} · ${read.status}.` : "",
          read.sans.length ? `Moves: ${numbered(read.sans)}` : "",
          `FEN: ${read.fen}`,
          `${legal.turn} to move. ${legal.check ? "In check. " : ""}Legal moves (UCI·SAN): ${legal.moves.map((move) => `${move.uci}·${move.san}`).join(" ")}`,
          legal.end || (read.puzzle && read.status === "solving") ? "" : `Engine: ${(await domain(ctx, "position", "lines", { fen: read.fen, multipv: 3, depth: 14, plies: 6 })).message}`,
        ].filter(Boolean).join("\n"),
      };
    },
  )
  .open(
    {
      nature: "/games",
      valence: "The games in the corpus, newest first — played here, imported or harvested. Read one with coach_game. Example: { limit: 10 }.",
      input: v.object({
        symbols: v.array(v.string()).optional().desc('Symbol slugs every game must carry. Example: ["game.result.white"].'),
        limit: v.integer().default(10).optional(),
      }),
    },
    async (ctx) => {
      const rows = await domain(ctx, "game", "list", { symbols: ctx.input.symbols, limit: ctx.input.limit ?? 10 });
      const games = rows.map((row) => {
        const { tags = {}, plies = row.trait.RECORDED?.moves?.length ?? 0 } = row.trait.RECORDED ?? {};
        return { game: row.id, white: tags.White ?? "?", black: tags.Black ?? "?", result: tags.Result ?? "*", date: tags.Date ?? null, plies, analysed: Boolean(row.trait.ANALYSED) };
      });
      return {
        games,
        message: games.length
          ? games.map((game) => `${game.game} · ${game.white} vs ${game.black} · ${game.result} · ${game.plies} plies${game.analysed ? " · analysed" : ""}`).join("\n")
          : "the corpus holds no games yet.",
      };
    },
  )
  .open(
    {
      nature: "/game",
      valence: "One game: its tags, the moves in SAN, and its analysis if it has one. Example: { game: \"01JQ…\" }.",
      input: v.object({ game: GAME }),
    },
    async (ctx) => {
      const { row, recorded, sans, analysed } = await record(ctx, ctx.input.game);
      const tags = recorded.tags ?? {};
      return {
        game: row.id,
        tags,
        sans,
        message: [
          `${tags.White ?? "?"} vs ${tags.Black ?? "?"} · ${tags.Result ?? "*"}${tags.Date ? ` · ${tags.Date}` : ""}`,
          sans.length ? numbered(sans) : "no moves.",
          analysed ? summary(analysed) : "Not analysed yet — coach_analyse runs the engine over it.",
        ].join("\n"),
      };
    },
  )
  .open(
    {
      nature: "/analyse",
      valence:
        "Run the engine over a whole game: every move judged by win chance lost, accuracy per side, the worst moments first. " +
        "A game from the corpus is stamped as analysed. Example: { game: \"01JQ…\", depth: 12 }.",
      input: v.object({
        game: GAME.optional(),
        moves: v.array(v.string()).optional().desc('A line as UCI instead of a game — a match in progress. Example: ["e2e4", "e7e5"].'),
        initial: v.string().optional().desc("The FEN the line starts from; the standard start when absent."),
        depth: v.integer().default(12).optional(),
      }),
    },
    async (ctx) => {
      const { game, moves, initial, depth = 12 } = ctx.input;
      if (!game && !moves?.length) return { condition: "ERROR", message: "name a game, or give the moves of a line" };
      const report = await analyse(ctx, { ...(game ? { game } : { moves, ...(initial && { initial }) }), depth });
      if (!report) return { condition: "ERROR", message: "no engine is consumed on this daemon — the analysis needs one" };
      return { report, message: summary(report) };
    },
  )
  .open(
    {
      nature: "/puzzle",
      valence: "One puzzle as posed: the position, whose move, rating, themes and how many plies — never the solution. Example: { puzzle: \"01JQ…\" }.",
      input: v.object({ puzzle: PUZZLE }),
    },
    async (ctx) => {
      const literal = ctx.daemon.entities.literal;
      const row = await literal.findOneOrFail(literal.reference(ctx.input.puzzle));
      const { solution, ...posed } = row.trait.POSED;
      return {
        puzzle: row.id,
        ...posed,
        plies: solution.length,
        message: `puzzle ${row.slug} · ${posed.level} (${posed.rating}) · ${posed.fen.split(" ")[1] === "w" ? "white" : "black"} to move · ${solution.length} plies · themes ${(posed.themes ?? []).join(", ") || "none"}\nFEN: ${posed.fen}`,
      };
    },
  )
  .open(
    {
      nature: "/solution",
      valence: "A puzzle's whole solving line in SAN — for after it is over, or when the solver asks for it. Example: { puzzle: \"01JQ…\" }.",
      input: v.object({ puzzle: PUZZLE }),
    },
    async (ctx) => {
      const literal = ctx.daemon.entities.literal;
      const row = await literal.findOneOrFail(literal.reference(ctx.input.puzzle));
      const { fen, solution } = row.trait.POSED;
      const line = await domain(ctx, "rules", "replay", { fen, moves: solution });
      const sans = line.plies.map((ply) => ply.san);
      return { puzzle: row.id, solution, sans, message: `solution: ${sans.join(" ")}` };
    },
  );
