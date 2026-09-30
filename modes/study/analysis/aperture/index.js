import { v, Vector } from "@vivalence/typology";

const BUFFER = v.string().desc("The study buffer's id. Example: \"01JQ…\".");
const PROGRESS = v.object({ stage: v.string(), done: v.integer(), total: v.integer(), message: v.string().optional() });

const domain = (ctx, door, path, input) => ctx.daemon.call[door][path]({ ...ctx, input, output: undefined });

const load = async (ctx, id) => {
  const buffer = await ctx.daemon.entities.buffer.findOneOrFail({ id });
  return { buffer, data: { ...buffer.data } };
};

const save = async (ctx, buffer, data) => {
  await ctx.daemon.entities.buffer.updateOne({ id: buffer.id }, { data });
  return data;
};

// a game's line laid out for the board: every FEN, every SAN
const layout = async (ctx, { initial, moves }) => {
  const line = await domain(ctx, "rules", "replay", { fen: initial, moves });
  return { initial, moves, sans: line.sans, fens: [initial, ...line.plies.map((ply) => ply.fen)] };
};

const ANSWER = v.object({ explanation: v.string().desc("Three sentences at most. Example: \"Nf3 developed a piece but let the queen in on h4…\"") });

export const aperture = new Vector();

aperture
  .branch("/analysis")
  .open(
    {
      nature: "/load",
      valence: 'Put a game on the board: a corpus game by id, or PGN text. Opens a new study buffer unless one is given. Example: { pgn: "1. e4 e5 …" }.',
      input: v.object({
        buffer: BUFFER.optional(),
        game: v.string().optional().desc("A game literal's id or slug."),
        pgn: v.string().optional().desc("PGN text."),
        thread: v.string().optional().desc("The thread a new buffer lands on."),
      }),
    },
    async (ctx) => {
      const literal = ctx.daemon.entities.literal;
      let row = null;
      let parsed;
      if (ctx.input.game) {
        row = await literal.findOneOrFail(literal.reference(ctx.input.game));
        parsed = { initial: row.trait.RECORDED.initial ?? undefined, moves: row.trait.RECORDED.moves, tags: row.trait.RECORDED.tags };
      } else if (ctx.input.pgn) {
        [parsed] = await domain(ctx, "rules", "pgn", { pgn: ctx.input.pgn });
      } else throw new Error("[analysis] /load needs a game or a pgn");
      const initial = parsed.initial ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const laid = await layout(ctx, { initial, moves: parsed.moves });
      const tags = parsed.tags ?? {};
      const title = [tags.White, tags.Black].filter(Boolean).join(" – ") + (tags.Result ? ` ${tags.Result}` : "");
      // the opening: what the corpus row knows, else the catalogue over this line
      const opened = row?.trait?.OPENED ?? (initial === laid.initial && !parsed.initial ? await domain(ctx, "opening", "classify", { moves: parsed.moves }) : null);
      const data = {
        game: row?.id ?? undefined,
        title: title.trim() || `${parsed.moves.length} plies`,
        tags,
        opening: opened?.eco ? { eco: opened.eco, name: opened.name, lastBookPly: opened.lastBookPly } : undefined,
        ...laid,
        cursor: 0,
        status: "idle",
        report: row?.trait?.ANALYSED ?? undefined,
        explanations: {},
        ladders: {},
        progress: undefined,
      };
      if (data.report) data.status = "done";
      if (ctx.input.buffer) {
        const { buffer } = await load(ctx, ctx.input.buffer);
        buffer.literals.removeAll();
        if (row) buffer.literals.add(row);
        return save(ctx, buffer, { ...buffer.data, ...data });
      }
      const thread = ctx.input.thread ?? ctx.thread?.id;
      const buffer = await ctx.mode.application.buffer({ data, ...(row && { literals: [row] }), ...(thread && { thread }) });
      await ctx.daemon.entities.em.flush();
      return buffer;
    },
  )
  .open(
    {
      nature: "/run",
      valence: "Run the engine over every position of the loaded game and stream progress; the report lands on the buffer. Example: { buffer: \"01JQ…\", depth: 14 }.",
      input: v.object({ buffer: BUFFER, depth: v.integer().default(14).optional() }),
      yields: PROGRESS,
    },
    async function* (ctx) {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      data.depth = ctx.input.depth ?? data.depth ?? 14;
      data.status = "running";
      data.progress = { done: 0, total: data.fens.length };
      await save(ctx, buffer, data);
      let report = null;
      let last = null;
      const records = await domain(ctx, "analysis", "game", data.game ? { game: data.game, depth: data.depth } : { moves: data.moves, initial: data.initial, depth: data.depth });
      for await (const record of records) {
        last = record;
        if (record.stage === "engine") break;
        if (record.report) report = record.report;
        yield { stage: record.stage, done: record.done, total: record.total, message: record.message };
      }
      if (!report) {
        data.status = "failed";
        data.progress = { done: 0, total: data.fens.length, message: last?.message ?? "no report" };
        await save(ctx, buffer, data);
        yield { stage: "failed", done: 0, total: data.fens.length, message: data.progress.message };
        return;
      }
      data.status = "done";
      data.report = report;
      data.progress = { done: data.fens.length, total: data.fens.length };
      await save(ctx, buffer, data);
      yield { stage: "done", done: data.fens.length, total: data.fens.length, message: `accuracy white ${report.accuracy.white} · black ${report.accuracy.black}` };
    },
  )
  .open(
    {
      nature: "/seek",
      valence: "Put the position after ply n on the board. Example: { buffer: \"01JQ…\", ply: 12 }.",
      input: v.object({ buffer: BUFFER, ply: v.integer() }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      data.cursor = Math.max(0, Math.min(data.moves.length, ctx.input.ply));
      return save(ctx, buffer, data);
    },
  )
  .open(
    {
      nature: "/elo",
      valence: "Which strength plays the move at a ply — the domain's limitstrength ladder, kept on the buffer per ply. Example: { buffer: \"01JQ…\", ply: 12 }.",
      input: v.object({ buffer: BUFFER, ply: v.integer().desc("The ply whose move is asked about, 1-based. Example: 12.") }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      const ply = ctx.input.ply;
      if (ply < 1 || ply > data.moves.length) throw new Error(`[analysis] ply ${ply} is not on the board — the line has ${data.moves.length} plies`);
      const ladder = await domain(ctx, "position", "elo", { fen: data.fens[ply - 1], uci: data.moves[ply - 1] });
      if (!ladder.rungs) return { ply, ladder: null, message: ladder.message };
      data.ladders = { ...data.ladders, [String(ply)]: ladder };
      await save(ctx, buffer, data);
      return { ply, ladder };
    },
  )
  .open(
    {
      nature: "/explain",
      valence: "Ask the hallucinator why a ply was judged as it was, from the engine's lines. Example: { buffer: \"01JQ…\", ply: 12 }.",
      input: v.object({ buffer: BUFFER, ply: v.integer() }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      const judgement = data.report?.judgements?.find((entry) => entry.ply === ctx.input.ply);
      if (!judgement) throw new Error(`[analysis] no judgement for ply ${ctx.input.ply} — run the analysis first`);
      const before = data.fens[ctx.input.ply - 1];
      const afterLine = data.report.judgements[ctx.input.ply]?.eval;
      const brief = [
        `Game: ${data.title}. Ply ${judgement.ply}, ${judgement.ply % 2 ? "white" : "black"} played ${judgement.san} (${judgement.uci}).`,
        `Position before the move (FEN): ${before}`,
        `Moves so far: ${data.sans.slice(0, judgement.ply).join(" ")}`,
        `Judgement: ${judgement.judgement} — win chance ${judgement.before}% → ${judgement.after}% (${judgement.loss} lost).`,
        judgement.eval ? `Engine's best line before the move: ${judgement.eval.mate != null ? `mate in ${judgement.eval.mate}` : `${(judgement.eval.cp / 100).toFixed(2)}`} ${judgement.eval.pv.slice(0, 6).join(" ")}` : "",
        judgement.best ? `Engine preferred: ${judgement.best}.` : "The move was the engine's choice.",
        afterLine ? `After the move the engine sees: ${afterLine.mate != null ? `mate in ${afterLine.mate}` : `${(afterLine.cp / 100).toFixed(2)}`} ${afterLine.pv.slice(0, 6).join(" ")} (from the opponent's side).` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const render = await ctx.mode.harness.object.render({ turns: [{ role: "user", parts: [{ type: "text", text: brief }] }], output: ANSWER });
      const explanation = render?.output?.object?.explanation ?? "";
      data.explanations = { ...data.explanations, [String(judgement.ply)]: explanation };
      await save(ctx, buffer, data);
      return { ply: judgement.ply, explanation };
    },
  );
