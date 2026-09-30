import { atom } from "nanostores";
import * as board from "./board.js";

export const BLITZ = { initial: 180, increment: 2 };
export const SEATED = { white: { kind: "user" }, black: { kind: "engine", elo: 1600, movetime: 600 } };

const HELD = [
  [(next) => next.fen === undefined && next.data !== undefined, (next) => next.data],
  [() => true, (next) => next],
];

const OCCUPANTS = {
  user: () => ({ kind: "user" }),
  engine: () => ({ kind: "engine", elo: 1600, movetime: 600 }),
  hallucinator: () => ({ kind: "hallucinator", assisted: true }),
};

const LEVELS = [
  [(seat) => seat.kind === "engine" && seat.elo === undefined, (seat) => ({ ...seat, elo: board.next(board.ELOS, 1600) })],
  [(seat) => seat.kind === "engine", (seat) => ({ ...seat, elo: board.next(board.ELOS, seat.elo) })],
  [(seat) => seat.kind === "hallucinator", (seat) => ({ ...seat, assisted: seat.assisted !== true })],
  [() => true, (seat) => seat],
];

const CLOCKS = [
  [(data) => data.clock === undefined, () => ({})],
  [() => true, (data) => ({ clock: { initial: data.clock.initial, increment: data.clock.increment } })],
];

export const session = (buffer) => {
  const $busy = atom(false);
  const $fault = atom(null);
  let chain = Promise.resolve(null);
  let open = true;

  const call = (path, input) => buffer.mode.connection.call(`/match/${path}`, { buffer: buffer.id, ...input });
  const hold = (next) => {
    buffer.data = HELD.find(([test]) => test(next))[1](next);
    return buffer.data;
  };
  const guarded = (label, work) => {
    chain = chain.then(async () => {
      $busy.set(true);
      try {
        const out = await work();
        $fault.set(null);
        return out;
      } catch (error) {
        $fault.set(`${label} · ${error.message}`);
        return null;
      } finally {
        $busy.set(false);
      }
    });
    return chain;
  };
  const drive = async (state) => {
    let current = state;
    while (open && current !== null && current.status !== "ended" && current.seats[current.turn].kind !== "user") {
      const answer = await call("step", {});
      if (!answer.moved) break;
      current = hold(answer.data);
    }
    return current;
  };

  return {
    $busy,
    $fault,
    get busy() {
      return $busy.get();
    },
    get fault() {
      return $fault.get();
    },
    move: (uci) => guarded("move", async () => drive(hold(await call("move", { uci })))),
    start: () => guarded("start", () => drive({ ...buffer.data })),
    resume: () => guarded("resume", () => drive({ ...buffer.data })),
    resign: () => guarded("resign", async () => hold(await call("resign", { side: board.seated(buffer.data) }))),
    offer: () => guarded("draw", async () => hold(await call("offer", { side: board.seated(buffer.data), draw: true }))),
    seek: (ply) => guarded("seek", async () => hold(await call("seek", { ply: Math.max(0, Math.min(board.plies(buffer.data), ply)) }))),
    view: (input) => guarded("view", async () => hold(await call("view", input))),
    flip: () => guarded("flip", async () => hold(await call("view", { orientation: board.opponent(board.oriented(buffer.data)) }))),
    render: () => guarded("render", async () => hold(await call("view", { render: board.next(board.RENDERED, board.setting(buffer.data)) }))),
    seat: (side, occupant) => guarded("seat", async () => hold(await call("seat", { side, occupant }))),
    opponent: () => {
      const side = board.rival(buffer.data);
      return guarded("seat", async () => hold(await call("seat", { side, occupant: OCCUPANTS[board.next(board.KINDS, buffer.data.seats[side].kind)]() })));
    },
    level: () => {
      const side = board.rival(buffer.data);
      return guarded("seat", async () => hold(await call("seat", { side, occupant: LEVELS.find(([test]) => test(buffer.data.seats[side]))[1](buffer.data.seats[side]) })));
    },
    fresh: () =>
      guarded("new", async () =>
        hold(await call("create", { seats: buffer.data.seats, ...CLOCKS.find(([test]) => test(buffer.data))[1](buffer.data), rewindable: buffer.data.rewindable, thread: buffer.thread.id }))),
    open: () =>
      guarded("new", async () => hold(await call("create", { seats: SEATED, clock: BLITZ, rewindable: false, thread: buffer.thread.id }))),
    close: () => {
      open = false;
    },
  };
};

const ALWAYS = () => true;

export const COMMANDS = [
  { name: "start", label: () => "▶ start", ready: board.waiting, run: (held) => held.start() },
  { name: "new", label: () => "new", ready: ALWAYS, run: (held) => held.fresh() },
  { name: "resign", label: () => "resign", ready: board.live, run: (held) => held.resign() },
  { name: "draw", label: () => "draw", ready: board.live, run: (held) => held.offer() },
  { name: "flip", label: () => "flip", ready: ALWAYS, run: (held) => held.flip() },
  { name: "opponent", label: (data) => `vs ${board.named(data.seats[board.rival(data)])}`, ready: (data) => !board.locked(data), run: (held) => held.opponent() },
  { name: "level", label: (data) => board.option(data.seats[board.rival(data)]), ready: (data) => !board.locked(data) && board.option(data.seats[board.rival(data)]) !== "", run: (held) => held.level() },
  { name: "back", label: () => "◀", ready: (data) => data.rewindable && board.at(data) > 0, run: (held, data) => held.seek(board.at(data) - 1) },
  { name: "forward", label: () => "▶", ready: (data) => data.rewindable && board.at(data) < board.plies(data), run: (held, data) => held.seek(board.at(data) + 1) },
  { name: "render", label: (data) => `pieces ${board.setting(data)}`, ready: ALWAYS, run: (held) => held.render() },
];

export const ready = (data) => COMMANDS.filter((command) => command.ready(data));
