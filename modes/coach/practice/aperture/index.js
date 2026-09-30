import { v, Vector } from "@vivalence/typology";
import { apply, ladderOf, load, save, seal } from "../tools/index.js";

const { Packet } = v.primitives.hallucination;

const BUFFER = v.string().desc("The practice buffer's id. Example: \"01JQ…\".");
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const domain = (ctx, door, path, input) => ctx.daemon.call[door][path]({ ...ctx, input, output: undefined });

export const aperture = new Vector();

aperture
  .branch("/practice")
  .open(
    {
      nature: "/create",
      valence:
        "Start a practice game: which side the student plays, how hard the coach plays. With a buffer, that buffer is reset in place. " +
        'Example: { student: "black", strength: "gentle" }.',
      input: v.object({
        buffer: BUFFER.optional(),
        student: v.enum(["white", "black"]).default("white").optional(),
        strength: v.enum(["gentle", "club", "strong"]).default("club").optional(),
        thread: v.string().optional(),
      }),
    },
    async (ctx) => {
      const legal = await domain(ctx, "rules", "legal", { fen: START });
      const data = {
        student: ctx.input.student ?? "white",
        strength: ctx.input.strength ?? "club",
        fen: START,
        initial: START,
        turn: "white",
        waiting: false,
        dests: legal.dests,
        check: false,
      };
      if (ctx.input.buffer) {
        const { buffer } = await load(ctx, ctx.input.buffer);
        buffer.literals.removeAll();
        buffer.data = ctx.mode.application.fill({ data });
        await ctx.daemon.entities.em.flush();
        return buffer;
      }
      const thread = ctx.input.thread ?? ctx.thread?.id;
      const buffer = await ctx.mode.application.buffer({ data, ...(thread && { thread }) });
      await ctx.daemon.entities.em.flush();
      return buffer;
    },
  )
  .open(
    {
      nature: "/legal",
      valence: "The legal moves on the practice board. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { data } = await load(ctx, ctx.input.buffer);
      return domain(ctx, "rules", "legal", { fen: data.fen });
    },
  )
  .open(
    {
      nature: "/move",
      valence: "The student's move. The coach answers when /practice/turn runs. Example: { buffer: \"01JQ…\", uci: \"e2e4\" }.",
      input: v.object({ buffer: BUFFER, uci: v.string() }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (data.status === "ended") return data;
      if (data.turn !== data.student) throw new Error(`it is the coach's move (${data.turn})`);
      const after = await domain(ctx, "rules", "apply", { fen: data.fen, uci: ctx.input.uci });
      apply(data, after);
      data.waiting = data.status !== "ended";
      await save(ctx, buffer, data);
      if (data.status === "ended") await seal(ctx, buffer, data);
      return data;
    },
  )
  .open(
    {
      nature: "/turn",
      valence:
        "Let the coach take its turn on the operator's thread: it reads the board, asks the engine, plays its move through its tools and answers the student. " +
        "Streams the hallucination; the board updates through the buffer. Example: { buffer: \"01JQ…\", thread: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER, thread: v.string().optional().desc("The thread the talk lands on; the buffer's when absent. Example: \"01JQ…\".") }),
      yields: Packet.Response,
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      const last = data.sans.at(-1);
      const text = data.status === "ended"
        ? `The game is over: ${data.result} by ${data.reason}. Board ${buffer.id}. Say how it went and offer one lesson.`
        : last
        ? `The student played ${last}. Board ${buffer.id}: it is ${data.turn === data.student ? "still the student's" : "your"} move. Take your turn.`
        : `A new practice game on board ${buffer.id}; the student plays ${data.student}. ${data.turn === data.student ? "Greet them in one line and wait for their move." : "Open the game with your first move, then one line of greeting."}`;
      return ctx.mode.harness.dialogue.stream({
        thread: ctx.input.thread ?? buffer.thread?.id ?? ctx.thread?.id,
        parts: [{ type: "text", text }],
        controller: ctx.controller?.branch?.("dialogue"),
      });
    },
  )
  .open(
    {
      nature: "/ask",
      valence:
        "The student asks the coach something without moving; the coach answers from the board on the operator's thread. " +
        'Streams the hallucination. Example: { buffer: "01JQ…", text: "why not Qxb7?" }.',
      input: v.object({ buffer: BUFFER, text: v.string().desc('The student\'s words. Example: "why not Qxb7?".'), thread: v.string().optional() }),
      yields: Packet.Response,
    },
    async (ctx) => {
      const { buffer } = await load(ctx, ctx.input.buffer);
      const text = `${ctx.input.text.trim()}\n(Board ${buffer.id}. The student is asking, not moving — answer from the board; play your own move only if it is your turn and you have not taken it yet.)`;
      return ctx.mode.harness.dialogue.stream({
        thread: ctx.input.thread ?? buffer.thread?.id ?? ctx.thread?.id,
        parts: [{ type: "text", text }],
        controller: ctx.controller?.branch?.("dialogue"),
      });
    },
  )
  .open(
    {
      nature: "/elo",
      valence: "Which strength plays the student's last move — the domain's ladder, kept on the buffer per ply. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER, ply: v.integer().optional().desc("A ply to ask about instead of the student's last. Example: 7.") }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      return ladderOf(ctx, buffer, data, ctx.input.ply ?? null);
    },
  )
  .open(
    {
      nature: "/resign",
      valence: "The student resigns. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (data.status === "ended") return data;
      data.status = "ended";
      data.result = data.student === "white" ? "0-1" : "1-0";
      data.reason = "resignation";
      data.waiting = false;
      await save(ctx, buffer, data);
      await seal(ctx, buffer, data);
      return data;
    },
  );
