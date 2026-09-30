import { specimen, steer, Vector } from "@vivalence/typology";
import * as play from "../play.viva.js";
import { SEAT, TALK } from "../harness.js";
import { engine, mount, mountMode } from "../../../../tests/rig.js";

const { describe, it, expect, beforeAll, afterAll } = specimen;

describe("play mode — the agent's hands", { sanitizeResources: false, sanitizeOps: false }, () => {
  let rig;
  let board;
  let scripted;

  beforeAll(async () => {
    scripted = engine();
    rig = await mount({ engine: scripted });
    board = await mountMode(rig, play);
  });

  afterAll(async () => rig?.close());

  it("P-talk-and-seat: the seat's voice rides object calls, the coach's talk rides dialogue — never both", () => {
    expect([...play.harness.trie.keys()].sort()).toEqual(["dialogue", "object"]);
    expect(SEAT).toMatch(/exactly one legal move as UCI/);
    expect(TALK).toMatch(/only when that person asks you to/);
    expect(TALK).toMatch(/coach_explain/);
  });

  it("P-board: an agent reads a match with its seats, whose move and the legal moves", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "engine", elo: 1500 } } });
    const read = await board.invoke("/match/board", { buffer: buffer.id });
    expect(read.turn).toBe("white");
    expect(read.message).toMatch(/white: user · black: engine 1500/);
    expect(read.message).toMatch(/e2e4·e4/);
    expect(read.message).toMatch(/Engine: ScriptedFish depth 14/);
  });

  it("P-beside: the talk sees the thread's newest board and the engine's lines there before it asks", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    await board.call("/match/move", { buffer: buffer.id, uci: "d2d4" });
    const ctx = { daemon: rig.daemon, mode: board.mode, thread: rig.thread, hallucination: { system: {}, policy: {} } };
    const probe = new Vector().slurp(play.harness);
    probe.branch("dialogue").open("probe", () => null);
    await steer.dispatch.invoke(probe, "/dialogue/probe", steer.strategy.direct)(ctx);
    expect(ctx.hallucination.system.coach).toBe(TALK);
    expect(ctx.hallucination.system.board).toMatch(new RegExp(`Board ${buffer.id}`));
    expect(ctx.hallucination.system.board).toMatch(/Moves: 1\. d4/);
    expect(ctx.hallucination.system.board).toMatch(/Engine: ScriptedFish/);
    expect(ctx.hallucination.system.seat).toBeUndefined();
  });

  it("P-agent-move: the agent plays the side to move, the ply is marked as its own, and the bot seat answers", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "engine" } } });
    const played = await board.invoke("/match/move", { buffer: buffer.id, uci: "g1f3" });
    expect(played.played).toEqual({ side: "white", uci: "g1f3", san: "Nf3" });
    expect(played.answer?.uci).toBeTruthy();
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(held.data.moves.length).toBe(2);
    expect(held.data.marks).toEqual([{ ply: 1, kind: "agent", tried: [] }]);
  });

  it("P-agent-any-side: the agent may move for a bot seat too", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "engine" }, black: { kind: "user" } } });
    const played = await board.invoke("/match/move", { buffer: buffer.id, uci: "d2d4" });
    expect(played.played.san).toBe("d4");
    expect(played.answer).toBeUndefined();
  });

  it("P-agent-illegal: an illegal move is an error sentence with the board, and nothing changes", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    const refused = await board.invoke("/match/move", { buffer: buffer.id, uci: "e2e5" });
    expect(refused.condition).toBe("ERROR");
    expect(refused.message).toMatch(/e2e5 is not legal here/);
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(held.data.moves).toEqual([]);
  });

  it("P-list: the boards list newest first, filtered by state", async () => {
    const buffer = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    await board.invoke("/match/move", { buffer: buffer.id, uci: "e2e4" });
    const listed = await board.invoke("/match/list", { status: "playing" });
    expect(listed.matches.every((match) => match.status === "playing")).toBe(true);
    expect(listed.matches.some((match) => match.buffer === buffer.id)).toBe(true);
  });
});
