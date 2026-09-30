import { v, Vector } from "@vivalence/typology";
import { UCI } from "../types.js";
import { finish, load, play, step, tick } from "../aperture/index.js";

// the match's hands for an agent: read a board, list the boards, move for a side. the same
// functions the doors run — one path for the view and the agent. armed as match_* on this mode's
// harness; an AGENTIC mode elsewhere sees them as play_match_*.

const rules = (ctx, path, input) => ctx.daemon.call.rules[path]({ ...ctx, input, output: undefined });

const BUFFER = v.string().desc("The match buffer's id — from match_list or the thread's buffers. Example: \"01JQ…\".");

const label = (seat) =>
  seat.kind === "engine" ? `engine${seat.elo ? ` ${seat.elo}` : ""}` : seat.kind === "hallucinator" ? "model" : seat.kind;

const numbered = (sans) => sans.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san)).join(" ");

export const describe = (buffer, data, legal) =>
  [
    `Board ${buffer.id} · white: ${label(data.seats.white)} · black: ${label(data.seats.black)} · ${data.status}${data.result ? ` ${data.result} by ${data.reason}` : ""}.`,
    data.opening ? `Opening: ${data.opening.eco} ${data.opening.name}.` : "",
    data.sans.length ? `Moves: ${numbered(data.sans)}` : "No moves yet.",
    `FEN: ${data.fen}`,
    data.status !== "ended" ? `${data.turn} to move — that seat is ${label(data.seats[data.turn])}.` : "",
    legal ? `${legal.check ? "In check. " : ""}Legal moves (UCI·SAN): ${legal.moves.map((move) => `${move.uci}·${move.san}`).join(" ")}` : "",
    data.clock ? `Clock: white ${Math.round(data.clock.white ?? data.clock.initial)}s · black ${Math.round(data.clock.black ?? data.clock.initial)}s.` : "",
  ]
    .filter(Boolean)
    .join("\n");

// what the engine sees on a board: its top lines at the position shown, walked into SAN. called
// before the agent asks — by match_board and by the talk's harness — never a reason to fail.
export const SIGHT = { multipv: 3, depth: 14, plies: 6 };

export const sight = async (ctx, data, reach = SIGHT) => {
  if (data.status === "ended") return null;
  try {
    const found = await ctx.daemon.call.position.lines({ ...ctx, input: { fen: data.shown?.fen ?? data.fen, ...reach }, output: undefined });
    return `Engine: ${found.message}`;
  } catch (error) {
    return `Engine: unavailable — ${error.message}`;
  }
};

// the board the talk is about: the newest match on the conversation's thread
export const beside = async (ctx) => {
  if (!ctx.thread) return null;
  const [buffer] = await ctx.daemon.entities.buffer.find({ thread: ctx.thread.id, mode: ctx.mode.id }, { orderBy: { updatedAt: "DESC" }, limit: 1 });
  if (!buffer) return null;
  const data = buffer.data;
  const legal = data.status === "ended" ? null : await rules(ctx, "legal", { fen: data.fen, variant: data.variant });
  return [describe(buffer, data, legal), await sight(ctx, data)].filter(Boolean).join("\n");
};

export const tools = new Vector();

tools
  .branch("/match")
  .open(
    {
      nature: "/list",
      valence: "The matches on the boards, newest first — id, seats, status, plies. Read one with match_board. Example: { status: \"playing\" }.",
      input: v.object({
        status: v.enum(["pending", "playing", "ended"]).optional().desc('Only matches in this state. Example: "playing".'),
        limit: v.integer().default(10).optional(),
      }),
    },
    async (ctx) => {
      const buffers = await ctx.daemon.entities.buffer.find({ mode: ctx.mode.id }, { orderBy: { updatedAt: "DESC" }, limit: 50 });
      const rows = buffers
        .filter((buffer) => !ctx.input.status || buffer.data?.status === ctx.input.status)
        .slice(0, ctx.input.limit ?? 10)
        .map((buffer) => ({
          buffer: buffer.id,
          white: label(buffer.data.seats.white),
          black: label(buffer.data.seats.black),
          status: buffer.data.status,
          plies: buffer.data.moves.length,
          ...(buffer.data.result && { result: buffer.data.result }),
        }));
      return {
        matches: rows,
        message: rows.length
          ? rows.map((row) => `${row.buffer} · ${row.white} vs ${row.black} · ${row.status}${row.result ? ` ${row.result}` : ""} · ${row.plies} plies`).join("\n")
          : "no matches on the boards.",
      };
    },
  )
  .open(
    {
      nature: "/board",
      valence:
        "Read one match as it stands: seats, moves, position, whose move, the legal moves and the engine's top lines there. Read it before you talk about it or move on it. " +
        'Example: { buffer: "01JQ…", multipv: 3, depth: 14, plies: 6 }.',
      input: v.object({
        buffer: BUFFER,
        multipv: v.integer().default(SIGHT.multipv).optional().desc("How many engine lines, 0 for none. Example: 3."),
        depth: v.integer().default(SIGHT.depth).optional().desc("The engine's search depth. Example: 14."),
        plies: v.integer().default(SIGHT.plies).optional().desc("How deep each line is walked, in plies. Example: 6."),
      }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      const legal = data.status === "ended" ? null : await rules(ctx, "legal", { fen: data.fen, variant: data.variant });
      const { multipv = SIGHT.multipv, depth = SIGHT.depth, plies = SIGHT.plies } = ctx.input;
      const seen = multipv > 0 ? await sight(ctx, data, { multipv, depth, plies }) : null;
      return { buffer: buffer.id, fen: data.fen, turn: data.turn, status: data.status, sans: data.sans, seats: data.seats, message: [describe(buffer, data, legal), seen].filter(Boolean).join("\n") };
    },
  )
  .open(
    {
      nature: "/move",
      valence:
        "Play one move for the side to move, whoever sits there; the ply is marked as the agent's. A bot seat answers after it, as it would a person. " +
        "Move for a person's seat only when that person asked you to. Example: { buffer: \"01JQ…\", uci: \"g1f3\" }.",
      input: v.object({ buffer: BUFFER, uci: UCI }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (data.cursor != null) return { condition: "ERROR", message: "the board is rewound — seek back to the live position first" };
      tick(data);
      if (data.status === "ended") {
        await finish(ctx, buffer, data);
        return { condition: "ERROR", message: `the match is over: ${data.result} by ${data.reason}` };
      }
      const legal = await rules(ctx, "legal", { fen: data.fen, variant: data.variant });
      if (!legal.moves.some((move) => move.uci === ctx.input.uci)) {
        return { condition: "ERROR", message: `${ctx.input.uci} is not legal here. ${describe(buffer, data, legal)}` };
      }
      const side = data.turn;
      const ply = data.moves.length + 1;
      await play(ctx, data, ctx.input.uci);
      data.marks = [...(data.marks ?? []), { ply, kind: "agent", tried: [] }];
      await finish(ctx, buffer, data);
      const answered = data.status !== "ended" && data.seats[data.turn].kind !== "user" ? await step(ctx, data) : { moved: false };
      if (answered.moved) await finish(ctx, buffer, data);
      return {
        buffer: buffer.id,
        played: { side, uci: ctx.input.uci, san: data.sans[ply - 1] },
        ...(answered.moved && { answer: { uci: answered.uci, san: data.sans.at(-1) } }),
        message: `${side} played ${data.sans[ply - 1]}${answered.moved ? `; ${data.sans.at(-1)} came back` : ""}.\n${describe(buffer, data, null)}`,
      };
    },
  );
