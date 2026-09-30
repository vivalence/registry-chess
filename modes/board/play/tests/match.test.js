import { specimen } from "@vivalence/typology";
import * as play from "../play.viva.js";
import { OCCUPANT as OWN } from "../types.js";
import { engine, mount, mountMode } from "../../../../tests/rig.js";
import { renderView } from "../../../../tests/render.js";
import { OCCUPANT as DOMAIN } from "../../../../domain/schematics.js";

const { describe, it, expect, beforeAll, afterAll } = specimen;

const SCHOLAR = ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"];
const ENTRY = new URL("../buffer/Play.svelte", import.meta.url).pathname;

describe("play mode — the assembly", () => {
  it("P-manifest: board/play is an agentic, conversational game with an App, a harness and its own tools", () => {
    expect(play.manifest.type).toBe("board");
    expect([...play.manifest.traits].sort()).toEqual(["AGENTIC", "APPLICATION", "CONVERSATIONAL", "EXPOSED", "HARNESSED", "STANDALONE", "TOOLING"]);
    expect(play.application.mount).toBe("buffer/Play.svelte");
    expect(typeof play.harness.use).toBe("function");
  });

  it("P-seat-vocabulary: the mode's OCCUPANT restates the domain's, arm for arm", () => {
    const arms = (schema) => (schema.anyOf ?? []).map((arm) => Object.keys(arm.properties).sort().join(","));
    expect(arms(OWN)).toEqual(arms(DOMAIN));
  });
});

describe("play mode — a match through the aperture", { sanitizeResources: false, sanitizeOps: false }, () => {
  let rig;
  let board;
  let scripted;
  let answers;
  let slow;

  beforeAll(async () => {
    scripted = engine();
    rig = await mount({ engine: scripted });
    answers = [];
    slow = 0;
    board = await mountMode(rig, play, {
      // the scripted "model": plays what the queue says, else the first legal move it was shown;
      // `slow` makes it think for that many milliseconds, so a clock can be seen to drain
      harness: async (request) => {
        if (slow) await new Promise((resolve) => setTimeout(resolve, slow));
        const brief = request.turns[0].parts[0].text;
        const legal = brief.match(/Legal moves \(UCI · SAN\): (.+)/)[1].split(" ").map((pair) => pair.split("·")[0]);
        const next = answers.shift();
        return { uci: next ?? legal[0], comment: "played" };
      },
    });
  });

  afterAll(async () => rig?.close());

  it("P-create: a match buffer opens at the start with its seats and a clock", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "engine", elo: 1400 } }, clock: { initial: 180, increment: 2 } });
    expect(buffer.data.fen).toMatch(/^rnbqkbnr/);
    expect(buffer.data.turn).toBe("white");
    expect(buffer.data.status).toBe("pending");
    expect(buffer.data.clock.white).toBe(180);
    expect(buffer.data.seats.black.elo).toBe(1400);
  });

  it("P-move: the user's move is applied and the engine seat answers in the same call", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "engine" } } });
    const data = await board.call("/match/move", { buffer: buffer.id, uci: "e2e4" });
    expect(data.moves[0]).toBe("e2e4");
    expect(data.moves.length).toBe(2);
    expect(data.sans[0]).toBe("e4");
    expect(data.turn).toBe("white");
    expect(scripted.calls.filter((call) => call.kind === "play").length).toBe(1);
  });

  it("P-illegal: an illegal user move is a sentence and the match does not change", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    let message = null;
    try {
      await board.call("/match/move", { buffer: buffer.id, uci: "e2e5" });
    } catch (error) {
      message = error.message;
    }
    expect(message).toMatch(/e2e5 is not legal/);
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(held.data.moves).toEqual([]);
  });

  it("P-wrong-seat: moving for a bot seat is refused", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "engine" }, black: { kind: "user" } } });
    let message = null;
    try {
      await board.call("/match/move", { buffer: buffer.id, uci: "e2e4" });
    } catch (error) {
      message = error.message;
    }
    expect(message).toMatch(/white's move and that seat is engine/);
    const { moved, data } = await board.call("/match/step", { buffer: buffer.id });
    expect(moved).toBe(true);
    expect(data.turn).toBe("black");
  });

  it("P-seal: a mate ends the match, seals a game literal and binds it to the buffer", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    let data;
    for (const uci of SCHOLAR) data = await board.call("/match/move", { buffer: buffer.id, uci });
    expect(data.status).toBe("ended");
    expect(data.result).toBe("1-0");
    expect(data.reason).toBe("checkmate");
    expect(data.game).toBeTruthy();
    const game = await rig.entities.literal.findOne({ id: data.game });
    expect(game.ontology).toBe("game");
    expect(game.trait.RECORDED.moves).toEqual(SCHOLAR);
    expect(game.trait.SEATED.white.kind).toBe("user");
    const held = await rig.entities.buffer.findOne({ id: buffer.id }, { populate: ["literals"] });
    expect(held.literals.getItems().map((row) => row.id)).toEqual([data.game]);
    const again = await board.call("/match/move", { buffer: buffer.id, uci: "a2a3" });
    expect(again.moves.length).toBe(SCHOLAR.length);
  });

  it("P-hallucinator: a model seat answers through the harness; an assisted seat sees the engine's lines", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "hallucinator", assisted: true } } });
    const before = scripted.calls.filter((call) => call.kind === "evaluate").length;
    const data = await board.call("/match/move", { buffer: buffer.id, uci: "d2d4" });
    expect(data.moves.length).toBe(2);
    expect(data.thinking).toBe("played");
    expect(scripted.calls.filter((call) => call.kind === "evaluate").length).toBe(before + 1);
    expect(data.marks).toEqual([]);
  });

  it("P-illegal-retry: a model answering illegally twice gets a legal move played for it, and the ply is marked", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "hallucinator" }, black: { kind: "user" } } });
    answers.push("e2e5", "z9z9");
    const { data } = await board.call("/match/step", { buffer: buffer.id });
    expect(data.moves.length).toBe(1);
    expect(data.marks).toEqual([{ ply: 1, kind: "fallback", tried: ["e2e5", "z9z9"] }]);
    answers.push("e7e6", "e7e5");
    await board.call("/match/move", { buffer: buffer.id, uci: "e7e5" }).catch(() => {});
  });

  it("P-resign-offer: resignation and an accepted draw both end and seal", async () => {
    const one = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    await board.call("/match/move", { buffer: one.id, uci: "e2e4" });
    const resigned = await board.call("/match/resign", { buffer: one.id, side: "black" });
    expect(resigned.result).toBe("1-0");
    expect(resigned.reason).toBe("resignation");
    expect(resigned.game).toBeTruthy();
    const two = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    await board.call("/match/move", { buffer: two.id, uci: "e2e4" });
    const pending = await board.call("/match/offer", { buffer: two.id, side: "white", draw: true });
    expect(pending.offers).toEqual({ draw: "white" });
    expect(pending.status).toBe("playing");
    const drawn = await board.call("/match/offer", { buffer: two.id, side: "black", draw: true });
    expect(drawn.result).toBe("1/2-1/2");
    expect(drawn.reason).toBe("agreement");
  });

  it("P-seat-reset: the buffer carries the board's affordances, a seat changes while the match lives, create with a buffer resets it in place", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    expect(Object.keys(buffer.data.dests).sort()).toEqual(["a2", "b1", "b2", "c2", "d2", "e2", "f2", "g1", "g2", "h2"]);
    expect([...buffer.data.dests.e2].sort()).toEqual(["e3", "e4"]);
    expect(buffer.data.check).toBe(false);
    const seated = await board.call("/match/seat", { buffer: buffer.id, side: "black", occupant: { kind: "engine", elo: 2000 } });
    expect(seated.seats.black).toEqual({ kind: "engine", elo: 2000 });
    const data = await board.call("/match/move", { buffer: buffer.id, uci: "e2e4" });
    expect(data.moves.length).toBe(2);
    expect(Object.keys(data.dests).length).toBeGreaterThan(10);
    const reset = await board.call("/match/create", { buffer: buffer.id, seats: { white: { kind: "user" }, black: { kind: "user" } } });
    expect(reset.id).toBe(buffer.id);
    expect(reset.data.moves).toEqual([]);
    expect(reset.data.status).toBe("pending");
    expect(reset.data.seats.black.kind).toBe("user");
    for (const uci of SCHOLAR) await board.call("/match/move", { buffer: buffer.id, uci });
    let refused = null;
    try {
      await board.call("/match/seat", { buffer: buffer.id, side: "black", occupant: { kind: "user" } });
    } catch (error) {
      refused = error.message;
    }
    expect(refused).toMatch(/ended/);
    const ended = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(ended.data.dests).toEqual({});
  });

  it("P-clock-drain: a bot seat's thinking comes off its own clock before its move lands", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "hallucinator" } }, clock: { initial: 60, increment: 0 } });
    slow = 150;
    let data;
    try {
      data = await board.call("/match/move", { buffer: buffer.id, uci: "e2e4" });
    } finally {
      slow = 0;
    }
    expect(data.moves.length).toBe(2);
    expect(data.clock.running).toBe("white");
    expect(data.clock.white).toBe(60);
    expect(data.clock.black < 59.9, `black still has ${data.clock.black}`).toBe(true);
    expect(data.clock.black > 59, `black lost more than the think: ${data.clock.black}`).toBe(true);
  });

  it("P-fifty-repetition: the fifty-move rule and a threefold repetition end a match as draws, sealed", async () => {
    const worn = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } }, initial: "8/8/8/8/8/4k3/8/4K2R w K - 99 60" });
    const fifty = await board.call("/match/move", { buffer: worn.id, uci: "h1h2" });
    expect(fifty.status).toBe("ended");
    expect(fifty.result).toBe("1/2-1/2");
    expect(fifty.reason).toBe("fifty moves");
    expect(fifty.game).toBeTruthy();
    const shuffle = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    let data;
    for (const uci of ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1"]) data = await board.call("/match/move", { buffer: shuffle.id, uci });
    expect(data.status).toBe("playing");
    data = await board.call("/match/move", { buffer: shuffle.id, uci: "f6g8" });
    expect(data.status).toBe("ended");
    expect(data.reason).toBe("repetition");
    expect(data.moves.length).toBe(8);
    expect(data.dests).toEqual({});
  });

  it("P-rewind: a rewindable match walks back, forks on a move played there, and keeps the line it left", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } }, rewindable: true });
    for (const uci of ["e2e4", "e7e5", "g1f3", "b8c6"]) await board.call("/match/move", { buffer: buffer.id, uci });
    // the cursor walks back and the board follows it — the line itself is untouched
    const back = await board.call("/match/seek", { buffer: buffer.id, ply: 2 });
    expect(back.cursor).toBe(2);
    expect(back.moves.length).toBe(4);
    expect(back.shown.fen).toBe("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
    expect(back.shown.turn).toBe("white");
    expect(back.shown.lastMove).toBe("e7e5");
    // the affordances are the CURSOR's position, so a move from here is legal to the board
    expect(back.dests.g1).toContain("f3");
    // the last ply goes back to the live position
    const live = await board.call("/match/seek", { buffer: buffer.id, ply: 4 });
    expect(live.cursor).toBe(undefined);
    expect(live.shown).toBe(undefined);
    // a move played on a rewound board forks: the tail becomes a variation, the line is recut
    await board.call("/match/seek", { buffer: buffer.id, ply: 2 });
    const forked = await board.call("/match/move", { buffer: buffer.id, uci: "f1c4" });
    expect(forked.moves).toEqual(["e2e4", "e7e5", "f1c4"]);
    expect(forked.sans).toEqual(["e4", "e5", "Bc4"]);
    expect(forked.variations).toEqual([{ ply: 3, moves: ["g1f3", "b8c6"] }]);
    expect(forked.cursor).toBe(undefined);
    expect(forked.status).toBe("playing");
    // the abandoned line rides into the sealed record as a PGN variation, and the record says
    // the match was rewindable — RECORDED.moves stays the line that was actually finished
    await board.call("/match/resign", { buffer: buffer.id, side: "black" });
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    const game = await rig.entities.literal.findOne({ id: held.data.game });
    expect(game.trait.RECORDED.moves).toEqual(["e2e4", "e7e5", "f1c4"]);
    expect(game.trait.RECORDED.variations).toEqual([{ ply: 3, moves: ["g1f3", "b8c6"] }]);
    expect(game.trait.RECORDED.pgn).toMatch(/\(\s*2\. Nf3 Nc6\s*\)/);
    expect(game.trait.RECORDED.tags.Mode).toBe("rewindable");
    // against a bot the fork is the same cut, and the bot answers from the new line — the ply it
    // had played is kept, and the clock does not run across the cut
    const vs = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "engine", elo: 1600 } }, clock: { initial: 180, increment: 2 }, rewindable: true });
    await board.call("/match/move", { buffer: vs.id, uci: "e2e4" });
    const two = await board.call("/match/move", { buffer: vs.id, uci: "g1f3" });
    expect(two.moves.length).toBe(4);
    // ply 2 is white's move again, whatever the engine answered with — the fork is the user's own
    const paused = await board.call("/match/seek", { buffer: vs.id, ply: 2 });
    expect(paused.clock.running).toBe(undefined);
    expect(paused.shown.turn).toBe("white");
    const other = await board.call("/match/move", { buffer: vs.id, uci: "d2d4" });
    expect(other.moves[0]).toBe("e2e4");
    expect(other.moves[2]).toBe("d2d4");
    // the bot answered the fork, so the line is four plies and the clock is running again
    expect(other.moves.length).toBe(4);
    expect(other.clock.running).toBe("white");
    // what it walked away from: white's Nf3 and the reply, kept from the ply they stood at
    expect(other.variations.at(-1)).toEqual({ ply: 3, moves: two.moves.slice(2) });

    // a match that is not rewindable refuses the door outright
    const plain = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    await board.call("/match/move", { buffer: plain.id, uci: "e2e4" });
    await expect(board.call("/match/seek", { buffer: plain.id, ply: 0 })).rejects.toThrow(/not rewindable/);
  });

  it("P-render: the view server-renders the live row — the nav, both seats, the clocks, the rail, the match panel baked or open, the card over the board at the start and at the end", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "engine", elo: 1600 } }, clock: { initial: 180, increment: 2 } });
    await board.call("/match/move", { buffer: buffer.id, uci: "e2e4" });
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    const { text, body } = await renderView(ENTRY, { buffer: { id: held.id, data: held.data } });
    expect(text).toMatch(/^♞ play study riddles practice library engine stockfish engine 1600 elo/);
    expect(text).toMatch(/you user/);
    expect(text).toMatch(/\b(3:0[0-2]|2:5\d)\b/);
    expect(text).toMatch(/⇅ ☰ ♪ \+ ½ ⚑/);
    expect(text).toMatch(/match moves 2 ✕ white you black stockfish 1600 club time control 3\+2 blitz rewindable baked in at the first move · \+ new opens the setup again$/);
    expect(body).toMatch(/title="new match · asks twice"/);
    expect((body.match(/class="sq [^"]*grab/g) ?? []).length).toBeGreaterThan(10);
    expect(body).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    // before the first move the panel is inputs: all three kinds, the strength, the time control
    const pending = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "engine", elo: 1600 } }, clock: { initial: 180, increment: 2 } });
    const open = await renderView(ENTRY, { buffer: { id: pending.id, data: pending.data ?? (await rig.entities.buffer.findOne({ id: pending.id })).data } });
    expect(open.text).toMatch(/setup moves 0 ✕ white you stockfish a model black you stockfish a model − 1600 club \+ 1320 1600 2000 2400 2800 max/);
    expect(open.text).toMatch(/time control 3\+2 blitz 1\+0 3\+2 5\+0 10\+0 15\+10 unlimited minutes each − 3 \+ increment, seconds − 2 \+ rewindable the first move bakes the seats, the clock and rewindable into the game$/);
    expect(open.body).toMatch(/title="new match"/);
    // rewindable is one chip: its border says on or off, its title says what it does
    expect(open.body).toMatch(/class="chip toggle[^"]*"[^>]*title="off — every move stands/);
    expect(open.body).not.toMatch(/class="chip toggle[^"]*\bon\b/);
    // two bots wait for start, and the note says so
    const bots = await board.call("/match/create", { seats: { white: { kind: "engine", elo: 2000 }, black: { kind: "engine", elo: 1600 } } });
    const idle = await renderView(ENTRY, { buffer: { id: bots.id, data: (await rig.entities.buffer.findOne({ id: bots.id })).data } });
    expect(idle.text).toMatch(/setup moves 0 ✕ setup two seats, no user — ▶ start lets them play/);
    expect(idle.text).toMatch(/not started stockfish against stockfish the seats and the clock bake in at the first move ▶ start ⇅ ☰ ♪ \+ ▶ ½ ⚑/);
    expect(idle.body).toMatch(/title="start the engines"/);
    // so does a match where a bot has white — the card over the board says start, and the rail again
    const robot = await board.call("/match/create", { seats: { white: { kind: "engine", elo: 1600 }, black: { kind: "user" } }, clock: { initial: 180, increment: 2 } });
    const wait = await renderView(ENTRY, { buffer: { id: robot.id, data: (await rig.entities.buffer.findOne({ id: robot.id })).data } });
    expect(wait.text).toMatch(/not started stockfish has white the seats and the clock bake in at the first move ▶ start ⇅ ☰ ♪ \+ ▶ ½ ⚑ you user 3:00 setup moves 0 ✕ setup stockfish has white — ▶ start begins the match/);
    expect((wait.body.match(/title="start the match"/g) ?? []).length).toBe(2);
    // the end: the card tells the outcome as the user's own where one seat is theirs, and what comes next
    const over = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "engine", elo: 1600 } } });
    await board.call("/match/move", { buffer: over.id, uci: "e2e4" });
    await board.call("/match/resign", { buffer: over.id, side: "white" });
    const lost = await renderView(ENTRY, { buffer: { id: over.id, data: (await rig.entities.buffer.findOne({ id: over.id })).data } });
    expect(lost.text).toMatch(/game over you lost 0-1 · resignation rematch set up analyse review ⇅ ☰ ♪ \+ ½ ⚑ you user match moves 2 ✕ result 0-1 · resignation/);
    expect(lost.body).toMatch(/title="again, colours swapped"/);
    expect(lost.body).toMatch(/title="open this game in the study"/);
    // a rewindable match rewound: the rail carries ‹ ›, the note says where the board is, and the
    // piles walk back with it — at ply 4 of the scholar's mate nothing has been taken yet
    const walk = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } }, rewindable: true });
    for (const uci of SCHOLAR) await board.call("/match/move", { buffer: walk.id, uci });
    const tip = await renderView(ENTRY, { buffer: { id: walk.id, data: (await rig.entities.buffer.findOne({ id: walk.id })).data } });
    // the tip of the mate: white took the f7 pawn, so the pile sits on BLACK's row and the lead
    // on white's — a seat shows what it lost, and only the seat ahead shows a number
    expect(tip.text).toMatch(/engine you user ♟︎ /);
    expect(tip.text).toMatch(/⚑ you user \+1 match/);
    expect(tip.text).toMatch(/⇅ ☰ ♪ ‹ › \+ ½ ⚑/);
    await board.call("/match/seek", { buffer: walk.id, ply: 4 });
    const mid = await renderView(ENTRY, { buffer: { id: walk.id, data: (await rig.entities.buffer.findOne({ id: walk.id })).data } });
    expect(mid.text).toMatch(/rewound showing ply 4 of 7 — play a move here to fork the game, › to come back/);
    expect(mid.text).not.toMatch(/⚑ you user \+1 match/);
    expect(mid.text).not.toMatch(/game over/);
    expect(mid.body).toMatch(/title="a ply back · ←"/);
    // two users: the result is told by colour
    const pair = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    for (const uci of SCHOLAR) await board.call("/match/move", { buffer: pair.id, uci });
    const mated = await renderView(ENTRY, { buffer: { id: pair.id, data: (await rig.entities.buffer.findOne({ id: pair.id })).data } });
    expect(mated.text).toMatch(/game over white wins 1-0 · checkmate rematch set up analyse review/);
  });

  it("P-no-engine: an engine seat without a consumed engine is a sentence, not a crash", async () => {
    const services = rig.daemon.services;
    rig.daemon.services = {};
    try {
      const buffer = await board.call("/match/create", { seats: { white: { kind: "engine" }, black: { kind: "user" } } });
      let message = null;
      try {
        await board.call("/match/step", { buffer: buffer.id });
      } catch (error) {
        message = error.message;
      }
      expect(message).toMatch(/no engine consumed/);
    } finally {
      rig.daemon.services = services;
    }
  });
});
