import { v, Vector } from "@vivalence/typology";

const BUFFER = v.string().desc("The practice buffer's id, from the thread's buffer list. Example: \"01JQ…\".");

const domain = (ctx, door, path, input) => ctx.daemon.call[door][path]({ ...ctx, input, output: undefined });

export const load = async (ctx, id) => {
  const buffer = await ctx.daemon.entities.buffer.findOneOrFail({ id });
  return { buffer, data: { ...buffer.data } };
};

// every save recomputes the board's affordances — the view reads them off the buffer
export const save = async (ctx, buffer, data) => {
  if (data.fen && data.status !== "ended") {
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

const coach = (data) => (data.student === "white" ? "black" : "white");

// the student's last ply, or a named one; the domain's ladder for the move played there, kept on
// the buffer. the position before the ply is replayed from the line — the buffer holds only the
// current FEN.
export const ladderOf = async (ctx, buffer, data, asked = null) => {
  const mine = (index) => (index % 2 === 0) === (data.student === "white");
  const ply = asked ?? [...data.moves.keys()].reverse().find(mine) + 1;
  if (!ply || ply < 1 || ply > data.moves.length) return { ply: null, ladder: null, message: "the student has not moved yet" };
  const before = ply === 1 ? data.initial : (await domain(ctx, "rules", "replay", { fen: data.initial, moves: data.moves.slice(0, ply - 1) })).fen;
  const ladder = await domain(ctx, "position", "elo", { fen: before, uci: data.moves[ply - 1] });
  if (!ladder.rungs) return { ply, ladder: null, message: ladder.message };
  data.ladders = { ...(data.ladders ?? {}), [String(ply)]: ladder };
  await save(ctx, buffer, data);
  return { ply, ladder, message: `${ladder.san} — ${ladder.verdict}. ${ladder.sentence}` };
};

export const describe = (data, legal) =>
  [
    `${data.turn} to move${data.turn === data.student ? " (the student)" : " (you, the coach)"}. Student plays ${data.student}, you play ${coach(data)}, strength ${data.strength}.`,
    data.sans.length ? `Moves: ${data.sans.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san)).join(" ")}` : "No moves yet.",
    `FEN: ${data.fen}`,
    data.status === "ended" ? `Game over: ${data.result} by ${data.reason}.` : "",
    legal ? `${legal.check ? "In check. " : ""}Legal moves: ${legal.moves.map((move) => `${move.uci}·${move.san}`).join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

// the coach's hands: read the board, ask the engine, play its own move, nudge the student.
// armed as practice_* — the root is exported, the doors sit under /practice.
export const tools = new Vector();

tools
  .branch("/practice")
  .open(
    {
      nature: "/board",
      valence: "The practice board: whose move, the line so far, the position, every legal move. Call this first. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { data } = await load(ctx, ctx.input.buffer);
      const legal = data.status === "ended" ? null : await domain(ctx, "rules", "legal", { fen: data.fen });
      return { ...data, legal: legal?.moves ?? [], message: describe(data, legal) };
    },
  )
  .open(
    {
      nature: "/assess",
      valence: "The engine's assessment of the practice position — best lines with scores from the side to move's view. Example: { buffer: \"01JQ…\", multipv: 3 }.",
      input: v.object({ buffer: BUFFER, multipv: v.integer().default(3).optional(), depth: v.integer().default(12).optional() }),
    },
    async (ctx) => {
      const { data } = await load(ctx, ctx.input.buffer);
      const found = await domain(ctx, "position", "eval", { fen: data.fen, depth: ctx.input.depth ?? 12, multipv: ctx.input.multipv ?? 3 });
      if (!found.evaluation) return { condition: "ERROR", message: found.message };
      const lines = found.evaluation.multipv.map((line, index) => {
        const score = line.mate != null ? `mate in ${line.mate}` : `${(line.cp / 100).toFixed(2)}`;
        return `${index + 1}. ${score} — ${line.pv.slice(0, 6).join(" ")}`;
      });
      return { evaluation: found.evaluation, message: `${found.evaluation.engine} depth ${found.evaluation.depth} (${data.turn} to move):\n${lines.join("\n")}` };
    },
  )
  .open(
    {
      nature: "/move",
      valence: "Play YOUR move as the coach — only when it is your side's turn, only a legal UCI move. A comment lands beside it on the board. Example: { buffer: \"01JQ…\", uci: \"g8f6\", comment: \"Developing.\" }.",
      input: v.object({ buffer: BUFFER, uci: v.string(), comment: v.string().optional() }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (data.status === "ended") return { condition: "ERROR", message: "the game is over" };
      if (data.turn === data.student) return { condition: "ERROR", message: `it is the student's move (${data.student}) — never play for them` };
      let after;
      try {
        after = await domain(ctx, "rules", "apply", { fen: data.fen, uci: ctx.input.uci });
      } catch (error) {
        const legal = await domain(ctx, "rules", "legal", { fen: data.fen });
        return { condition: "ERROR", message: `${error.message}. Legal: ${legal.moves.map((move) => move.uci).join(" ")}` };
      }
      apply(data, after);
      if (ctx.input.comment) data.notes = [...data.notes, { ply: data.moves.length, text: ctx.input.comment }];
      data.waiting = false;
      await save(ctx, buffer, data);
      if (data.status === "ended") await seal(ctx, buffer, data);
      return { fen: data.fen, san: after.san, status: data.status, result: data.result, message: `played ${after.san}${data.status === "ended" ? ` — game over ${data.result} by ${data.reason}` : ""}` };
    },
  )
  .open(
    {
      nature: "/elo",
      valence:
        "Which strength plays the student's last move (or a named ply): the position searched at 1320, 1600, 2000, 2400, 2800 and full strength. " +
        "A number for the move, never a rating of the student. Needs the engine. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER, ply: v.integer().optional().desc("A ply to ask about instead of the student's last. Example: 7.") }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      const found = await ladderOf(ctx, buffer, data, ctx.input.ply ?? null);
      if (!found.ladder) return { condition: "ERROR", message: found.message };
      const rungs = found.ladder.rungs.map((rung) => `${rung.elo}: ${rung.san}${rung.agrees ? " ✓" : ""}`).join(" · ");
      return { ply: found.ply, ladder: found.ladder, message: `${found.message}\n${rungs}` };
    },
  )
  .open(
    {
      nature: "/note",
      valence: "Leave a coaching line about the student's last move beside the board. Example: { buffer: \"01JQ…\", text: \"Castling early keeps the king safe.\" }.",
      input: v.object({ buffer: BUFFER, text: v.string() }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      data.notes = [...data.notes, { ply: data.moves.length, text: ctx.input.text }];
      await save(ctx, buffer, data);
      return { message: "noted" };
    },
  );

export const apply = (data, after) => {
  data.fen = after.fen;
  data.moves = [...data.moves, after.uci];
  data.sans = [...data.sans, after.san];
  data.turn = after.turn;
  data.status = after.end ? "ended" : "playing";
  if (after.end) {
    data.result = after.outcome?.result ?? "1/2-1/2";
    data.reason = after.checkmate ? "checkmate" : after.stalemate ? "stalemate" : after.insufficient ? "insufficient" : "repetition";
  }
  return data;
};

export const seal = async (ctx, buffer, data) => {
  if (data.game) return data;
  const literal = ctx.daemon.entities.literal;
  const row = await literal.seal({
    tags: { Event: "practice", White: data.student === "white" ? "student" : "coach", Black: data.student === "black" ? "student" : "coach" },
    moves: data.moves,
    initial: data.initial,
    result: data.result,
    reason: data.reason,
    seats: { white: data.student === "white" ? { kind: "user" } : { kind: "hallucinator", assisted: true }, black: data.student === "black" ? { kind: "user" } : { kind: "hallucinator", assisted: true } },
  });
  data.game = row.id;
  buffer.literals.add(row);
  await save(ctx, buffer, data);
  return data;
};
