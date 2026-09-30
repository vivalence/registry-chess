import { shard, v, Vector } from "@vivalence/typology";
import * as rules from "../rules/index.js";
import * as types from "../schematics.js";
import { judge } from "../analysis/judge.js";

const MISSING_ENGINE =
  "no engine is consumed by this daemon — declare consume.engine: { module: \"@chess/service/stockfish\" } on the daemon and set VIVA_SERVICE_STOCKFISH_BINARY";

// the engine, or null. every verb that needs one says so in a sentence instead of throwing.
export const engine = (ctx) => ctx.daemon.services?.engine ?? null;

// evaluate one position: the cache first, the engine on a miss, the record after. the ONE path
// every eval in the package takes.
export const evaluate = async (ctx, { fen, depth = 16, multipv = 1 }) => {
  const literal = ctx.daemon.entities.literal;
  const position = await literal.reach(fen);
  const held = literal.evaluated(position, { depth });
  if (held && (held.multipv?.length ?? 0) >= multipv) return { position, evaluation: held, cached: true };
  const service = engine(ctx);
  if (!service) return { position, evaluation: null, cached: false, message: MISSING_ENGINE };
  const found = await service.evaluate({ fen: position.trait.PLACED.fen, depth, multipv });
  const evaluation = { ...found, at: new Date().toISOString() };
  await literal.record(position, evaluation);
  return { position, evaluation, cached: false };
};

// the engine's best lines at a position, each walked into SAN: `multipv` lines, `plies` deep, from a
// `depth` search. what a board shows an agent before it is asked — the one lines path for every mode.
export const lines = async (ctx, { fen, depth = 14, multipv = 3, plies = 6 }) => {
  const { evaluation, cached, message } = await evaluate(ctx, { fen, depth, multipv });
  if (!evaluation) return { fen, lines: [], message };
  const found = evaluation.multipv.slice(0, multipv).map((line, index) => ({
    rank: index + 1,
    score: line.mate != null ? `mate in ${line.mate}` : `${line.cp >= 0 ? "+" : ""}${(line.cp / 100).toFixed(2)}`,
    ...(line.mate != null ? { mate: line.mate } : { cp: line.cp }),
    uci: line.pv.slice(0, plies),
    san: rules.replay({ fen, moves: line.pv.slice(0, plies) }).sans,
  }));
  return {
    fen,
    engine: evaluation.engine,
    depth: evaluation.depth,
    cached,
    lines: found,
    message: `${evaluation.engine} depth ${evaluation.depth}${cached ? " (cached)" : ""}, side to move's view:\n${found.map((line) => `${line.rank}. ${line.score} — ${line.san.join(" ")}`).join("\n")}`,
  };
};

// the limitstrength ladder for one move: the position played at every rung, several searches per
// rung because limited-strength play is randomised, the cache first, the engine for what is
// missing, the record after. the elo of a move is the HIGHEST rung that still picks it at least
// half the time.
export const ladder = async (ctx, { fen, uci, rungs = types.RUNGS, samples = 5, movetime = 100 }) => {
  const literal = ctx.daemon.entities.literal;
  const position = await literal.reach(fen);
  const canonical = position.trait.PLACED.fen;
  const legal = rules.legal({ fen: canonical });
  const asked = legal.moves.find((move) => move.uci === uci);
  if (!asked) throw new Error(`[chess] ${uci} is not legal here — legal: ${legal.moves.map((move) => move.uci).join(" ")}`);
  const san = (played) => legal.moves.find((move) => move.uci === played)?.san ?? played;
  const service = engine(ctx);
  const found = [];
  let hits = 0;
  for (const elo of [...rungs, "full"]) {
    const held = literal.rung(position, elo)?.plays ?? [];
    const wanted = samples - held.length;
    let plays = held;
    if (wanted <= 0) hits++;
    else {
      if (!service) return { position: position.id, key: position.slug, uci, san: asked.san, rungs: null, message: MISSING_ENGINE };
      const fresh = [];
      for (let sample = 0; sample < wanted; sample++) fresh.push((await service.play({ fen: canonical, ...(elo === "full" ? {} : { elo }), movetime })).uci);
      plays = (await literal.ladder(position, { elo, plays: fresh, engine: service.name ?? null, movetime })).plays;
    }
    const tally = new Map();
    for (const played of plays) tally.set(played, (tally.get(played) ?? 0) + 1);
    const modal = [...tally.entries()].sort(([, a], [, b]) => b - a)[0][0];
    const share = (tally.get(uci) ?? 0) / plays.length;
    found.push({ elo, uci: modal, san: san(modal), plays, share, hold: tally.get(modal) / plays.length, agrees: share >= 0.5, cached: wanted <= 0 });
  }
  const agreeing = found.filter((rung) => rung.agrees);
  const top = agreeing.at(-1) ?? null;
  const elo = top?.elo ?? null;
  const after = top ? (found[found.indexOf(top) + 1] ?? null) : null;
  const switches = after && !after.agrees ? { elo: after.elo, uci: after.uci, san: after.san } : null;
  const missing = found.filter((rung) => !rung.agrees);
  const reach = found.filter((rung) => rung.share > 0).at(-1) ?? null;
  const spread = reach?.elo ?? null;
  const settled = found.every((rung) => rung.hold >= 0.6);
  const full = found.at(-1);
  const only = legal.moves.length === 1;
  const unanimous = agreeing.length === found.length;
  const strength = (rung) => (rung === "full" ? "full strength" : rung);
  const tries = (rung) => (rung.share > 0 && rung.share < 1 ? ` in ${Math.round(rung.share * rung.plays.length)} of ${rung.plays.length} searches` : "");
  const verdict = only
    ? "the only move"
    : unanimous
      ? "the engine's own move at every strength"
      : elo === null
        ? spread === null
          ? "a move no strength plays"
          : "one of several equal moves"
        : elo === "full"
          ? "the engine's own move — weaker searches miss it"
          : elo >= 2400
            ? "a strong player's move"
            : elo >= 1600
              ? "a club player's move"
              : "a beginner's move";
  const sentence = only
    ? `${asked.san} is the only legal move.`
    : unanimous
      ? `Stockfish limited to ${rungs.join(", ")} and at full strength all play ${asked.san}. There is nothing better to find.`
      : elo === null
        ? spread === null
          ? `No strength plays ${asked.san} — Stockfish limited to ${found[0].elo} already prefers ${found[0].san}; at full strength it plays ${full.san}.`
          : `No strength prefers ${asked.san} — Stockfish limited to ${strength(spread)} reaches for it${tries(reach)} among ${[...new Set(reach.plays)].filter((played) => played !== uci).map(san).join(" and ")}; at full strength it plays ${full.san}.`
        : elo === "full"
          ? `Stockfish at full strength plays ${asked.san}${tries(full)}; limited to ${missing.map((rung) => rung.elo).join(", ")} it prefers ${missing.at(-1).san}.`
          : `Stockfish limited to ${elo} still picks ${asked.san}${tries(top)}; at ${strength(switches.elo)} it switches to ${switches.san}.`;
  return {
    position: position.id,
    key: position.slug,
    uci,
    san: asked.san,
    elo,
    spread,
    settled,
    only,
    unanimous,
    best: { uci: full.uci, san: full.san },
    switches,
    rungs: found,
    samples,
    hits,
    verdict,
    sentence,
  };
};

const engineDoor = new Vector().open(
  {
    nature: "/status",
    valence: "Whether an engine is consumed by this daemon, and which — the dot every chess buffer shows. Never spawns it. Example: {}.",
    input: v.object({}),
  },
  async (ctx) => {
    const service = engine(ctx);
    if (!service) return { present: false, message: MISSING_ENGINE };
    const about = (await service.about?.()) ?? {};
    return { present: true, ...about, ...(service.name && { engine: service.name }) };
  },
);

const rulesDoor = new Vector()
  .open(
    {
      nature: "/legal",
      valence: "Every legal move in a position, with the position's state. Example: { fen: START }.",
      input: v.object({ fen: types.FEN, variant: types.VARIANT }),
    },
    (ctx) => rules.legal(ctx.input),
  )
  .open(
    {
      nature: "/apply",
      valence: 'Play one UCI move on a FEN and get the position after it. Example: { fen: START, uci: "e2e4" }.',
      input: v.object({ fen: types.FEN, uci: types.UCI, variant: types.VARIANT }),
    },
    (ctx) => rules.apply(ctx.input),
  )
  .open(
    {
      nature: "/parse",
      valence: 'SAN → UCI in a position. Example: { fen: START, san: "Nf3" }.',
      input: v.object({ fen: types.FEN, san: types.SAN, variant: types.VARIANT }),
    },
    (ctx) => rules.parse(ctx.input),
  )
  .open(
    {
      nature: "/replay",
      valence: 'Replay a UCI line from a position — every ply with its FEN and SAN. Example: { moves: ["e2e4", "e7e5"] }.',
      input: v.object({ fen: types.FEN.optional(), moves: types.MOVES, variant: types.VARIANT }),
    },
    (ctx) => rules.replay(ctx.input),
  )
  .open(
    {
      nature: "/pgn",
      valence: "Read PGN text: tags, the main line as UCI, warnings. Example: { pgn: \"1. e4 e5 *\" }.",
      input: v.object({ pgn: types.PGN }),
    },
    (ctx) => rules.pgn.parse(ctx.input.pgn),
  );

const positionDoor = new Vector()
  .open(
    {
      nature: "/lines",
      valence:
        "The engine's top lines at a position, each walked into SAN — how many lines, how many plies deep, from what search depth. " +
        "Cached per position. Example: { fen: START, multipv: 3, depth: 14, plies: 6 }.",
      input: v.object({
        fen: types.FEN,
        multipv: v.integer().default(3).optional().desc("How many lines. Example: 3."),
        depth: v.integer().default(14).optional().desc("Search depth. Example: 14."),
        plies: v.integer().default(6).optional().desc("How deep each line is walked, in plies. Example: 6."),
      }),
    },
    (ctx) => lines(ctx, ctx.input),
  )
  .open(
    {
      nature: "/reach",
      valence: "The position literal for a FEN — minted under the position mount if new. Example: { fen: START }.",
      input: v.object({ fen: types.FEN }),
    },
    (ctx) => ctx.daemon.entities.literal.reach(ctx.input.fen),
  )
  .open(
    {
      nature: "/eval",
      valence:
        "The engine's assessment of a position — cached on the position literal, the engine only on a miss. " +
        "Without an engine the answer names the fix. Example: { fen: START, depth: 16, multipv: 3 }.",
      input: v.object({
        fen: types.FEN,
        depth: v.integer().default(16).optional().desc("Search depth. Example: 16."),
        multipv: v.integer().default(1).optional().desc("How many best lines. Example: 3."),
      }),
    },
    async (ctx) => {
      const { position, evaluation, cached, message } = await evaluate(ctx, ctx.input);
      return { position: position.id, key: position.slug, fen: position.trait.PLACED.fen, evaluation, cached, ...(message && { message }) };
    },
  )
  .open(
    {
      nature: "/elo",
      valence:
        "The limitstrength ladder for one move: the position searched several times at every rung, cached per position and rung. The elo of " +
        'a move is the highest rung that still picks it at least half the time. Without an engine the answer names the fix. Example: { fen: START, uci: "e2e4" }.',
      input: v.object({
        fen: types.FEN,
        uci: types.UCI,
        rungs: v.array(v.integer()).optional().desc("Strengths to try, ascending; full strength is always tried last. Example: [1320, 1600, 2000, 2400, 2800]."),
        samples: v.integer().default(5).optional().desc("Searches per strength — limited-strength play is randomised, one search is noise. Example: 5."),
        movetime: v.integer().default(100).optional().desc("Milliseconds per search on a cache miss. Example: 100."),
      }),
    },
    (ctx) => ladder(ctx, ctx.input),
  );

const gameDoor = new Vector()
  .open(
    {
      nature: "/import",
      valence:
        "Import one or more games from PGN text as game literals. The same game twice is one row, and the answer says which were already held. " +
        'Example: { pgn: "[White \\"A\\"]\\n\\n1. e4 e5 1-0", source: { provider: "lichess", id: "abc123" } }.',
      input: v.object({
        pgn: types.PGN,
        source: v
          .object({ provider: v.string(), id: v.string().optional(), url: v.string().optional() })
          .optional()
          .desc('Where it came from. Example: { provider: "lichess", id: "9Tpl893a" }.'),
      }),
    },
    async (ctx) => {
      const literal = ctx.daemon.entities.literal;
      const games = [];
      for (const parsed of rules.pgn.parse(ctx.input.pgn)) {
        const line = rules.replay({ fen: parsed.initial, moves: parsed.moves });
        const opening = await literal.classify([parsed.initial, ...line.plies.map((ply) => ply.fen)]);
        const before = await literal.count({ slug: await rules.digest(`standard|${parsed.initial}|${parsed.moves.join(" ")}`) });
        const row = await literal.seal({
          tags: parsed.tags,
          moves: parsed.moves,
          initial: parsed.initial,
          source: ctx.input.source,
          opening: opening ? { eco: opening.eco, name: opening.name, pgn: opening.pgn, lastBookPly: opening.lastBookPly } : null,
        });
        games.push({ id: row.id, slug: row.slug, held: before > 0, plies: parsed.plies, warnings: parsed.warnings, opening: opening?.name ?? null });
      }
      return { games, imported: games.filter((game) => !game.held).length, held: games.filter((game) => game.held).length };
    },
  )
  .open(
    {
      nature: "/export",
      valence: 'A game literal as PGN text. Example: { game: "01JQ…" }.',
      input: v.object({ game: v.string().desc("The game literal's id or slug. Example: \"01JQ…\".") }),
    },
    async (ctx) => {
      const literal = ctx.daemon.entities.literal;
      const row = await literal.findOneOrFail(literal.reference(ctx.input.game));
      return { pgn: row.trait.RECORDED.pgn, tags: row.trait.RECORDED.tags };
    },
  )
  .open(
    {
      nature: "/list",
      valence: 'Game literals, newest first, scoped by symbols. Example: { symbols: ["game.result.white"], limit: 20 }.',
      input: v.object({
        symbols: v.array(v.string()).optional().desc('Symbol slugs every game must carry. Example: ["opening.eco.C42"].'),
        limit: v.integer().default(20).optional(),
        offset: v.integer().default(0).optional(),
      }),
    },
    (ctx) =>
      ctx.daemon.entities.literal.find(
        { ontology: "game", ...(ctx.input.symbols?.length && { symbols: ctx.input.symbols }) },
        { orderBy: { createdAt: "DESC" }, limit: ctx.input.limit ?? 20, offset: ctx.input.offset ?? 0 },
      ),
  )
  .open(
    {
      nature: "/count",
      valence: 'How many game literals the corpus holds, scoped by symbols. Example: { symbols: ["game.result.white"] }.',
      input: v.object({ symbols: v.array(v.string()).optional().desc('Symbol slugs every game must carry. Example: ["opening.eco.C42"].') }),
    },
    async (ctx) => ({ count: await ctx.daemon.entities.literal.count({ ontology: "game", ...(ctx.input.symbols?.length && { symbols: ctx.input.symbols }) }) }),
  );

const openingDoor = new Vector().open(
  {
    nature: "/classify",
    valence: 'Name the opening a line reaches — the deepest catalogued position wins. Example: { moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"] }.',
    input: v.object({ moves: types.MOVES.optional(), pgn: types.PGN.optional() }),
  },
  async (ctx) => {
    const moves = ctx.input.moves ?? rules.pgn.parse(ctx.input.pgn)[0].moves;
    const line = rules.replay({ moves });
    const found = await ctx.daemon.entities.literal.classify([rules.START, ...line.plies.map((ply) => ply.fen)]);
    if (!found) return { eco: null, name: null, pgn: null, lastBookPly: 0 };
    const { opening, ...rest } = found;
    return rest;
  },
);

const analysisDoor = new Vector().open(
  {
    nature: "/game",
    valence:
      "Analyse a whole game: one engine evaluation per position, every move judged by win % lost, accuracy and centipawn loss per side. " +
      "Streams progress; the last record carries the report. A game literal is stamped ANALYSED. Example: { game: \"01JQ…\", depth: 14 }.",
    input: v.object({
      game: v.string().optional().desc("A game literal's id or slug."),
      pgn: types.PGN.optional(),
      moves: types.MOVES.optional(),
      initial: types.FEN.optional(),
      depth: v.integer().default(14).optional(),
    }),
    yields: types.PROGRESS,
  },
  async function* (ctx) {
    const literal = ctx.daemon.entities.literal;
    let row = null;
    let moves = ctx.input.moves ?? null;
    let initial = ctx.input.initial ?? rules.START;
    if (ctx.input.game) {
      row = await literal.findOneOrFail(literal.reference(ctx.input.game));
      moves = row.trait.RECORDED.moves;
      initial = row.trait.RECORDED.initial ?? rules.START;
    } else if (ctx.input.pgn) {
      const [parsed] = rules.pgn.parse(ctx.input.pgn);
      moves = parsed.moves;
      initial = parsed.initial;
    }
    if (!moves) throw new Error("[chess] /analysis/game needs a game, a pgn or moves");
    const service = engine(ctx);
    if (!service) {
      yield { stage: "engine", done: 0, total: 0, message: MISSING_ENGINE };
      return;
    }
    const line = rules.replay({ fen: initial, moves });
    const fens = [initial, ...line.plies.map((ply) => ply.fen)];
    const depth = ctx.input.depth ?? 14;
    const evaluations = [];
    for (const [index, fen] of fens.entries()) {
      const { evaluation, cached } = await evaluate(ctx, { fen, depth });
      evaluations.push(evaluation);
      const top = evaluation?.multipv?.[0];
      yield {
        stage: "eval",
        done: index + 1,
        total: fens.length,
        message: `${index === 0 ? "start" : `ply ${index} ${line.plies[index - 1].san}`} · ${top?.mate != null ? `#${top.mate}` : `${((top?.cp ?? 0) / 100).toFixed(2)}`}${cached ? " (cached)" : ""}`,
      };
    }
    const report = judge({ plies: line.plies, evaluations, engine: evaluations[0]?.engine ?? "engine", depth });
    if (row) await literal.analysed(row, report);
    yield { stage: "report", done: fens.length, total: fens.length, message: `accuracy white ${report.accuracy.white} · black ${report.accuracy.black}`, report };
  },
);

const puzzleDoor = new Vector()
  .open(
    {
      nature: "/next",
      valence: 'One riddle at random in a level, never one of the excluded. Example: { level: "club", exclude: ["01JQ…"] }.',
      input: v.object({
        level: v.enum(types.LEVELS.map((band) => band.slug)).optional().desc('A level band. Example: "club".'),
        themes: v.array(v.string()).optional().desc('Theme slugs the puzzle must carry. Example: ["fork"].'),
        exclude: v.array(v.string()).optional().desc("Puzzle literal ids already seen."),
      }),
    },
    async (ctx) => {
      const row = await ctx.daemon.entities.literal.puzzle(ctx.input);
      if (!row) return null;
      // the solution never leaves with the riddle — /attempt checks it
      const { solution, ...posed } = row.trait.POSED;
      return { id: row.id, slug: row.slug, ...posed, plies: solution.length, side: posed.fen.split(" ")[1] };
    },
  )
  .open(
    {
      nature: "/attempt",
      valence:
        "Check a line against a riddle's solution. Every ply the solver plays must match; the opponent's replies are played for them. " +
        'Writes a trace for the caller. Example: { puzzle: "01JQ…", moves: ["d6f7"] }.',
      input: v.object({ puzzle: v.string(), moves: types.MOVES, thread: v.string().optional() }),
    },
    async (ctx) => {
      const literal = ctx.daemon.entities.literal;
      const row = await literal.findOneOrFail(literal.reference(ctx.input.puzzle));
      const { solution, fen } = row.trait.POSED;
      // the solver owns the even plies of the solution (0, 2, 4…); odd plies are the opponent's
      const played = ctx.input.moves;
      let matched = 0;
      for (const [index, uci] of played.entries()) {
        if (solution[index] !== uci) break;
        matched++;
      }
      const solved = matched === solution.length;
      const wrong = matched < played.length;
      // the solver's next expected ply, and the opponent's reply to the last matched solver ply
      const next = solution[matched] ?? null;
      const reply = !wrong && matched < solution.length && matched % 2 === 1 ? solution[matched] : null;
      const position = rules.replay({ fen, moves: solution.slice(0, matched) }).fen;
      const status = solved ? "SOLVED" : wrong ? "FAILED" : "PLAYING";
      if (status !== "PLAYING" && ctx.user) {
        await ctx.daemon.entities.trace.create({
          user: ctx.user.id,
          literal: row.id,
          mode: ctx.mode?.id ?? null,
          thread: ctx.input.thread ?? ctx.thread?.id ?? null,
          kind: "puzzle",
          signal: { enum: status, moves: played },
          status,
          snapshot: { rating: row.trait.POSED.rating, level: row.trait.POSED.level, matched, plies: solution.length },
        });
        await ctx.daemon.entities.em.flush();
      }
      return { status, solved, wrong, matched, plies: solution.length, reply, fen: position, ...(status === "FAILED" && { expected: solution[matched] }), ...(solved && { solution }) };
    },
  )
  .open(
    {
      nature: "/hint",
      valence: "The square the next solving move leaves from — a nudge, not the move. Example: { puzzle: \"01JQ…\", moves: [] }.",
      input: v.object({ puzzle: v.string(), moves: types.MOVES.default([]).optional() }),
    },
    async (ctx) => {
      const literal = ctx.daemon.entities.literal;
      const row = await literal.findOneOrFail(literal.reference(ctx.input.puzzle));
      const { solution } = row.trait.POSED;
      const played = ctx.input.moves ?? [];
      const matched = played.every((uci, index) => solution[index] === uci) ? played.length : 0;
      const next = solution[matched];
      return next ? { from: next.slice(0, 2), ply: matched + 1 } : { from: null, ply: matched + 1 };
    },
  )
  .open(
    {
      nature: "/reveal",
      valence: "The whole solving line of a riddle — for after it is over, never during. Example: { puzzle: \"01JQ…\" }.",
      input: v.object({ puzzle: v.string() }),
    },
    async (ctx) => {
      const literal = ctx.daemon.entities.literal;
      const row = await literal.findOneOrFail(literal.reference(ctx.input.puzzle));
      const { solution, fen } = row.trait.POSED;
      return { solution, sans: rules.replay({ fen, moves: solution }).sans };
    },
  );

export const aperture = new Vector();
aperture.branch("/engine").slurp(engineDoor);
aperture.branch("/rules").slurp(rulesDoor);
aperture.branch("/position").slurp(positionDoor);
aperture.branch("/game").slurp(gameDoor);
aperture.branch("/opening").slurp(openingDoor);
aperture.branch("/analysis").slurp(analysisDoor);
aperture.branch("/puzzle").slurp(puzzleDoor);

// the runtime calls this at daemon resolution: the domain's own userspace entity gets its
// repository + subscription endpoints, scoped to the caller.
export function resolve(daemon) {
  const { entities, twitch, aperture: root } = daemon;
  root
    .branch("/userspace/entities/trace")
    .slurp(shard.datamap.repository(entities.trace))
    .slurp(shard.datamap.reactive(entities.trace, twitch));
}
