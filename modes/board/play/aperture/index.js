import { v, Vector } from "@vivalence/typology";
import { OCCUPANT, SEATS, START, UCI } from "../types.js";
import { drivers } from "../seats.js";

// every rules question goes through the domain door — the mode holds no chess logic of its own
const rules = (ctx, path, input) => ctx.daemon.call.rules[path]({ ...ctx, input, output: undefined });

const BUFFER = v.string().desc("The match buffer's id. Example: \"01JQ…\".");

export const load = async (ctx, id) => {
  const buffer = await ctx.daemon.entities.buffer.findOneOrFail({ id });
  return { buffer, data: { ...buffer.data } };
};

// every save recomputes the board's affordances — the view reads them off the buffer, and while
// the match is rewound they are the CURSOR's position, not the tip's: that is the position the
// board is showing and the one a move would fork from. `fen` and `moves` never disagree.
export const save = async (ctx, buffer, data) => {
  const at = data.cursor == null ? null : await rules(ctx, "replay", { fen: data.initial, moves: data.moves.slice(0, data.cursor), variant: data.variant });
  data.shown = at ? { fen: at.fen, turn: at.turn, lastMove: data.moves[data.cursor - 1] ?? null } : undefined;
  const here = at ? at.fen : data.fen;
  if (here && (at || data.status !== "ended")) {
    const legal = await rules(ctx, "legal", { fen: here, variant: data.variant });
    data.dests = legal.dests;
    data.check = Boolean(legal.check);
  } else {
    data.dests = {};
    data.check = false;
  }
  await ctx.daemon.entities.buffer.updateOne({ id: buffer.id }, { data });
  return data;
};

// read the running clock; a flag ends the game
export const tick = (data, now = Date.now()) => {
  const clock = data.clock;
  if (!clock?.running || !clock.at) return data;
  const elapsed = (now - Date.parse(clock.at)) / 1000;
  const left = Math.max(0, (clock[clock.running] ?? clock.initial) - elapsed);
  clock[clock.running] = left;
  clock.at = new Date(now).toISOString();
  if (left <= 0) {
    data.status = "ended";
    data.result = clock.running === "white" ? "0-1" : "1-0";
    data.reason = "timeout";
    clock.running = undefined;
  }
  return data;
};

const end = (data, result, reason) => {
  data.status = "ended";
  data.result = result;
  data.reason = reason;
  if (data.clock) data.clock.running = undefined;
};

// the position on the board has stood three times — the rules door replays the line, this counts
const epd = (fen) => fen.split(" ").slice(0, 4).join(" ");
const repeated = async (ctx, data) => {
  const line = await rules(ctx, "replay", { fen: data.initial, moves: data.moves, variant: data.variant });
  const stood = [data.initial, ...line.plies.map((ply) => ply.fen)].map(epd);
  return stood.filter((position) => position === stood.at(-1)).length >= 3;
};

// apply one move to the match data: position, lists, clocks, end of game
export const play = async (ctx, data, uci) => {
  const after = await rules(ctx, "apply", { fen: data.fen, uci, variant: data.variant });
  data.fen = after.fen;
  data.moves = [...data.moves, after.uci];
  data.sans = [...data.sans, after.san];
  data.turn = after.turn;
  data.status = "playing";
  data.offers = {};
  if (data.clock) {
    const mover = after.turn === "white" ? "black" : "white";
    if (data.clock.running) data.clock[mover] = (data.clock[mover] ?? data.clock.initial) + (data.clock.increment ?? 0);
    data.clock.running = after.turn;
    data.clock.at = new Date().toISOString();
    if (data.clock.white == null) data.clock.white = data.clock.initial;
    if (data.clock.black == null) data.clock.black = data.clock.initial;
  }
  if (after.end) end(data, after.outcome?.result ?? "1/2-1/2", after.checkmate ? "checkmate" : after.stalemate ? "stalemate" : after.insufficient ? "insufficient" : "variant");
  else if (Number(after.fen.split(" ")[4]) >= 100) end(data, "1/2-1/2", "fifty moves");
  else if (await repeated(ctx, data)) end(data, "1/2-1/2", "repetition");
  return after;
};

// cut the line back to `ply` and keep what was cut — the tail becomes a variation the record
// carries, so a rewound match remembers what it walked away from. the clock stops: the seat is
// no longer answering the position it was thinking about.
const rewind = async (ctx, data, ply) => {
  const tail = data.moves.slice(ply);
  if (tail.length) data.variations = [...(data.variations ?? []), { ply: ply + 1, moves: tail }];
  data.moves = data.moves.slice(0, ply);
  data.sans = data.sans.slice(0, ply);
  data.marks = (data.marks ?? []).filter((mark) => mark.ply <= ply);
  const line = await rules(ctx, "replay", { fen: data.initial, moves: data.moves, variant: data.variant });
  data.fen = line.fen;
  data.turn = line.turn;
  data.cursor = undefined;
  data.offers = {};
  data.thinking = undefined;
  // a game that had ended is a game again; its seal is not undone, the buffer simply leaves it
  data.status = data.moves.length ? "playing" : "pending";
  data.result = undefined;
  data.reason = undefined;
  data.game = undefined;
  if (data.clock) data.clock.running = undefined;
  return data;
};

// seal a finished match into the corpus: the game literal, classified, bound to the buffer
const seal = async (ctx, buffer, data) => {
  if (data.game) return data;
  const literal = ctx.daemon.entities.literal;
  const line = await rules(ctx, "replay", { fen: data.initial, moves: data.moves, variant: data.variant });
  const opening = await literal.classify([data.initial, ...line.plies.map((ply) => ply.fen)]);
  const row = await literal.seal({
    tags: {
      Event: "vivalence",
      Site: ctx.daemon.manifest?.slug ?? "vivalence",
      Date: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
      White: label(data.seats.white),
      Black: label(data.seats.black),
      ...(data.rewindable && { Mode: "rewindable" }),
    },
    moves: data.moves,
    variations: data.variations ?? [],
    initial: data.initial,
    variant: data.variant,
    result: data.result,
    reason: data.reason,
    seats: data.seats,
    clock: data.clock ? { initial: data.clock.initial, increment: data.clock.increment ?? 0 } : null,
    opening: opening ? { eco: opening.eco, name: opening.name, pgn: opening.pgn, lastBookPly: opening.lastBookPly } : null,
  });
  data.game = row.id;
  if (opening) data.opening = { eco: opening.eco, name: opening.name, lastBookPly: opening.lastBookPly };
  buffer.literals.add(row);
  return data;
};

const label = (seat) =>
  seat.kind === "user" ? "user" : seat.kind === "engine" ? `engine${seat.elo ? ` ${seat.elo}` : ""}` : seat.kind === "hallucinator" ? `hallucinator${seat.assisted ? " (assisted)" : ""}` : "remote";

// let the side to move answer if it is not a user seat. one move per call.
export const step = async (ctx, data) => {
  if (data.status === "ended") return { moved: false, data };
  const seat = data.seats[data.turn];
  const driver = drivers[seat.kind];
  if (!driver || seat.kind === "user") return { moved: false, data };
  const legal = await rules(ctx, "legal", { fen: data.fen, variant: data.variant });
  const ply = data.moves.length + 1;
  const answer = await driver(ctx, { seat, data, legal });
  // the seat thought on its own clock — read it before the move lands; a flag ends the game
  tick(data);
  if (data.status === "ended") return { moved: false, data };
  if (!answer) return { moved: false, data };
  if (answer.fallback) data.marks = [...data.marks, { ply, kind: "fallback", tried: answer.tried ?? [] }];
  else if (answer.tried?.length) data.marks = [...data.marks, { ply, kind: "retry", tried: answer.tried }];
  await play(ctx, data, answer.uci);
  data.thinking = answer.comment ?? undefined;
  return { moved: true, data, uci: answer.uci };
};

export const finish = async (ctx, buffer, data) => {
  if (data.status === "ended") await seal(ctx, buffer, data);
  return save(ctx, buffer, data);
};

export const aperture = new Vector();

aperture
  .branch("/match")
  .open(
    {
      nature: "/create",
      valence:
        "Open a match: two seats, optionally a clock. With a buffer, that buffer is reset in place to the new match. " +
        'Example: { seats: { white: { kind: "user" }, black: { kind: "engine", elo: 1500 } } }.',
      input: v.object({
        buffer: BUFFER.optional(),
        seats: SEATS.optional(),
        variant: v.string().default("standard").optional(),
        initial: v.string().default(START).optional(),
        clock: v.object({ initial: v.number(), increment: v.number().default(0) }).optional(),
        rewindable: v.boolean().default(false).optional().desc("Whether the match may be stepped back and played on from an earlier ply. Example: true."),
        thread: v.string().optional().desc("The thread the buffer lands on."),
      }),
    },
    async (ctx) => {
      const { seats, variant = "standard", initial = START, clock, rewindable = false, thread } = ctx.input;
      const legal = await rules(ctx, "legal", { fen: initial, variant });
      const data = {
        variant,
        initial,
        fen: legal.fen,
        turn: legal.turn,
        seats: seats ?? { white: { kind: "user" }, black: { kind: "engine" } },
        ...(clock && { clock: { ...clock, white: clock.initial, black: clock.initial } }),
        rewindable,
        dests: legal.dests,
        check: Boolean(legal.check),
      };
      if (ctx.input.buffer) {
        const { buffer } = await load(ctx, ctx.input.buffer);
        buffer.literals.removeAll();
        buffer.data = ctx.mode.application.fill({ data });
        await ctx.daemon.entities.em.flush();
        return buffer;
      }
      const buffer = await ctx.mode.application.buffer({
        data,
        ...((thread ?? ctx.thread?.id) && { thread: thread ?? ctx.thread?.id }),
      });
      await ctx.daemon.entities.em.flush();
      return buffer;
    },
  )
  .open(
    {
      nature: "/seat",
      valence: 'Change who sits in a seat, any time before the match ends. Example: { buffer: "01JQ…", side: "black", occupant: { kind: "engine", elo: 2000 } }.',
      input: v.object({ buffer: BUFFER, side: v.enum(["white", "black"]), occupant: OCCUPANT }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (data.status === "ended") throw new Error("the match has ended — its seats are sealed with the game");
      data.seats = { ...data.seats, [ctx.input.side]: ctx.input.occupant };
      return save(ctx, buffer, data);
    },
  )
  .open(
    {
      nature: "/legal",
      valence: "The legal moves in a match's position, for the board. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { data } = await load(ctx, ctx.input.buffer);
      return rules(ctx, "legal", { fen: data.fen, variant: data.variant });
    },
  )
  .open(
    {
      nature: "/move",
      valence: "Play the caller's move, then let every non-user seat answer in turn. Example: { buffer: \"01JQ…\", uci: \"e2e4\" }.",
      input: v.object({ buffer: BUFFER, uci: UCI }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      // a move played on a rewound board forks: the tail it walks away from becomes a variation,
      // and the match is live again from here. the clock is not read across the cut
      if (data.cursor != null && data.rewindable) await rewind(ctx, data, data.cursor);
      else tick(data);
      if (data.status === "ended") return finish(ctx, buffer, data);
      if (data.seats[data.turn].kind !== "user") throw new Error(`it is ${data.turn}'s move and that seat is ${data.seats[data.turn].kind}`);
      await play(ctx, data, ctx.input.uci);
      await finish(ctx, buffer, data);
      // the reply: as many bot plies as follow (bot-vs-bot keeps going through /step)
      if (data.status !== "ended" && data.seats[data.turn].kind !== "user") {
        await step(ctx, data);
        await finish(ctx, buffer, data);
      }
      return data;
    },
  )
  .open(
    {
      nature: "/step",
      valence: "Let the side to move answer if it is a bot seat — one ply. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ buffer: BUFFER }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      // a rewound board is not the position anyone is answering — the bots wait for it to come back
      if (data.cursor != null) return { moved: false, data };
      tick(data);
      const { moved } = await step(ctx, data);
      await finish(ctx, buffer, data);
      return { moved, data };
    },
  )
  .open(
    {
      nature: "/seek",
      valence:
        "Show an earlier ply of a rewindable match — the board follows, and a move from there forks the game. " +
        'The last ply, or none, goes back to the live position. Example: { buffer: "01JQ…", ply: 4 }.',
      input: v.object({
        buffer: BUFFER,
        ply: v.integer().optional().desc("Plies to show, 0 for the starting position; the live position when absent. Example: 4."),
      }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (!data.rewindable) throw new Error("this match is not rewindable — start a rewindable one to step back through it");
      const ply = ctx.input.ply ?? data.moves.length;
      if (ply < 0 || ply > data.moves.length) throw new Error(`ply ${ply} is outside a ${data.moves.length}-ply match`);
      // the clock does not run against a position nobody is answering
      if (data.clock?.running) (tick(data), (data.clock.running = undefined));
      data.cursor = ply === data.moves.length ? undefined : ply;
      return save(ctx, buffer, data);
    },
  )
  .open(
    {
      nature: "/resign",
      valence: "Resign the caller's seat. Example: { buffer: \"01JQ…\", side: \"white\" }.",
      input: v.object({ buffer: BUFFER, side: v.enum(["white", "black"]).optional().desc("Which seat resigns; the side to move when absent. Example: \"black\".") }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (data.status === "ended") return data;
      const side = ctx.input.side ?? data.turn;
      data.status = "ended";
      data.result = side === "white" ? "0-1" : "1-0";
      data.reason = "resignation";
      if (data.clock) data.clock.running = undefined;
      return finish(ctx, buffer, data);
    },
  )
  .open(
    {
      nature: "/offer",
      valence: 'Offer, accept or decline a draw. A standing offer from the other side is accepted by offering back. Example: { buffer: "01JQ…", side: "white", draw: true }.',
      input: v.object({ buffer: BUFFER, side: v.enum(["white", "black"]), draw: v.boolean() }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      if (data.status === "ended") return data;
      const { side, draw } = ctx.input;
      if (!draw) {
        data.offers = {};
        return save(ctx, buffer, data);
      }
      const other = side === "white" ? "black" : "white";
      if (data.offers?.draw === other || data.seats[other].kind === "engine") {
        data.status = "ended";
        data.result = "1/2-1/2";
        data.reason = "agreement";
        data.offers = {};
        if (data.clock) data.clock.running = undefined;
        return finish(ctx, buffer, data);
      }
      data.offers = { draw: side };
      return save(ctx, buffer, data);
    },
  );
