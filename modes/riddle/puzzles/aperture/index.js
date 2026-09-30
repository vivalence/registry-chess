import { v, Vector } from "@vivalence/typology";

const BUFFER = v.string().desc("The riddle buffer's id. Example: \"01JQ…\".");
const LEVELS = ["novice", "apprentice", "club", "expert", "master"];

const domain = (ctx, door, path, input) => ctx.daemon.call[door][path]({ ...ctx, input, output: undefined });

const load = async (ctx, id) => {
  const buffer = await ctx.daemon.entities.buffer.findOneOrFail({ id }, { populate: ["literals"] });
  return { buffer, data: { ...buffer.data } };
};

// every save recomputes the board's affordances — the view reads them off the buffer
const save = async (ctx, buffer, data) => {
  if (data.fen && data.status === "solving") {
    const legal = await domain(ctx, "rules", "legal", { fen: data.fen });
    data.dests = legal.dests;
    data.check = Boolean(legal.check);
  } else {
    data.dests = {};
    data.check = false;
  }
  await ctx.daemon.entities.buffer.updateOne({ id: buffer.id }, { data });
  return data;
};

const solving = (data) => {
  if (data.status !== "solving" || !data.puzzle) throw new Error("[riddle] no riddle on the board — ask for the next one");
};

// the solving line in SAN, for eyes, once the riddle is over
const reveal = async (ctx, data) => {
  const found = await domain(ctx, "puzzle", "reveal", { puzzle: data.puzzle.id });
  data.solution = found.solution;
  data.line = found.sans;
  return found;
};

// what went wrong, for eyes: the move played and the move wanted, in SAN, and — when an engine is
// consumed — its answer to the move played, scored from the solver's side
const mistake = async (ctx, data, played, line) => {
  const step = played.length - 1;
  const found = { ply: played.length, san: line.plies.at(-1)?.san ?? played.at(-1), ...(data.line?.[step] && { wanted: data.line[step] }) };
  try {
    const assessed = await domain(ctx, "position", "eval", { fen: line.fen, depth: 12, multipv: 1 });
    const best = assessed.evaluation?.multipv?.[0];
    if (best?.pv?.length) {
      const answer = await domain(ctx, "rules", "replay", { fen: line.fen, moves: best.pv.slice(0, 3) });
      // the engine scores the side to move — the opponent, after the solver's move
      found.refutation = { sans: answer.sans, ...(best.mate != null ? { mate: -best.mate } : { cp: -best.cp }) };
    }
  } catch {
    // no engine, or it could not search: the move and the wanted move still say enough
  }
  return found;
};

export const aperture = new Vector();

aperture
  .branch("/riddle")
  .open(
    {
      nature: "/open",
      valence: 'Open a riddle buffer at a level and serve the first riddle; with a buffer, that buffer starts over at the level. Example: { level: "club" }.',
      input: v.object({ buffer: BUFFER.optional(), level: v.enum(LEVELS).default("novice").optional(), thread: v.string().optional() }),
    },
    async (ctx) => {
      if (ctx.input.buffer) {
        const { buffer, data } = await load(ctx, ctx.input.buffer);
        return serve(ctx, buffer, { ...data, level: ctx.input.level ?? data.level ?? "novice" });
      }
      const thread = ctx.input.thread ?? ctx.thread?.id;
      const buffer = await ctx.mode.application.buffer({ data: { level: ctx.input.level ?? "novice" }, ...(thread && { thread }) });
      await ctx.daemon.entities.em.flush();
      return serve(ctx, buffer, { ...buffer.data });
    },
  )
  .open(
    {
      nature: "/next",
      valence: 'Serve the next riddle, optionally changing level. A riddle skipped mid-solve counts as failed; changing level does not. Example: { buffer: "01JQ…", level: "expert" }.',
      input: v.object({ buffer: BUFFER, level: v.enum(LEVELS).optional() }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (data.status === "solving" && !ctx.input.level && !data.replay) {
        data.failed = (data.failed ?? 0) + 1;
        data.streak = 0;
      }
      if (ctx.input.level) data.level = ctx.input.level;
      return serve(ctx, buffer, data);
    },
  )
  .open(
    {
      nature: "/again",
      valence: "Put the current riddle back at its start, to try it once more. A replay moves no tally — solved, failed and the streak stay. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (!data.puzzle) throw new Error("[riddle] no riddle on the board — ask for the next one");
      data.played = [];
      data.fen = data.puzzle.fen;
      data.status = "solving";
      data.replay = true;
      data.hint = undefined;
      data.solution = undefined;
      data.line = undefined;
      data.missed = undefined;
      data.mistake = undefined;
      return save(ctx, buffer, data);
    },
  )
  .open(
    {
      nature: "/legal",
      valence: "The legal moves in the riddle's current position, for the board. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { data } = await load(ctx, ctx.input.buffer);
      if (!data.fen) return { moves: [], dests: {} };
      return domain(ctx, "rules", "legal", { fen: data.fen });
    },
  )
  .open(
    {
      nature: "/move",
      valence: "Play one solving move. A right move plays the opponent's reply too; a wrong one ends the riddle. Example: { buffer: \"01JQ…\", uci: \"d6f7\" }.",
      input: v.object({ buffer: BUFFER, uci: v.string() }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      solving(data);
      const played = [...data.played, ctx.input.uci];
      const checked = await domain(ctx, "puzzle", "attempt", { puzzle: data.puzzle.id, moves: played, thread: ctx.thread?.id ?? undefined });
      if (checked.status === "FAILED") {
        data.status = "failed";
        if (!data.replay) {
          data.failed = (data.failed ?? 0) + 1;
          data.streak = 0;
        }
        data.played = played;
        data.missed = ctx.input.uci;
        await reveal(ctx, data);
        // the wrong move stands on the board, so the eye sees what was played — and why it fails
        try {
          const line = await domain(ctx, "rules", "replay", { fen: data.puzzle.fen, moves: played });
          data.fen = line.fen;
          data.mistake = await mistake(ctx, data, played, line);
        } catch {
          data.fen = data.puzzle.fen;
          data.mistake = undefined;
        }
        return save(ctx, buffer, data);
      }
      data.played = checked.reply ? [...played, checked.reply] : played;
      data.fen = (await domain(ctx, "rules", "replay", { fen: data.puzzle.fen, moves: data.played })).fen;
      if (checked.status === "SOLVED") {
        data.status = "solved";
        if (!data.replay) {
          data.solved = (data.solved ?? 0) + 1;
          data.streak = data.hint ? 0 : (data.streak ?? 0) + 1;
        }
        await reveal(ctx, data);
      }
      return save(ctx, buffer, data);
    },
  )
  .open(
    {
      nature: "/hint",
      valence: "Name the square the next solving move leaves from. Costs the streak at once. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      solving(data);
      const nudge = await domain(ctx, "puzzle", "hint", { puzzle: data.puzzle.id, moves: data.played });
      data.hint = nudge.from ?? undefined;
      data.nudges = (data.nudges ?? 0) + 1;
      data.streak = 0;
      return save(ctx, buffer, data);
    },
  )
  .open(
    {
      nature: "/reveal",
      valence: "Give the riddle up: the whole line plays out on the board, it counts as failed. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      solving(data);
      const found = await reveal(ctx, data);
      data.played = found.solution;
      data.fen = (await domain(ctx, "rules", "replay", { fen: data.puzzle.fen, moves: found.solution })).fen;
      data.status = "failed";
      if (!data.replay) {
        data.failed = (data.failed ?? 0) + 1;
        data.streak = 0;
      }
      data.missed = undefined;
      data.mistake = undefined;
      return save(ctx, buffer, data);
    },
  );

const serve = async (ctx, buffer, data) => {
  const puzzle = await domain(ctx, "puzzle", "next", { level: data.level, exclude: data.seen ?? [] });
  data.played = [];
  data.hint = undefined;
  data.solution = undefined;
  data.line = undefined;
  data.missed = undefined;
  data.mistake = undefined;
  data.replay = false;
  if (!puzzle) {
    data.puzzle = undefined;
    data.fen = undefined;
    data.status = "idle";
    return save(ctx, buffer, data);
  }
  data.puzzle = puzzle;
  data.fen = puzzle.fen;
  data.status = "solving";
  data.seen = [...(data.seen ?? []), puzzle.id];
  const row = await ctx.daemon.entities.literal.findOne({ id: puzzle.id });
  buffer.literals.removeAll();
  if (row) buffer.literals.add(row);
  return save(ctx, buffer, data);
};
