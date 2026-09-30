import { specimen, shape } from "@vivalence/typology";
import paladin from "@vivalence/paladin";
import * as practice from "../practice.viva.js";
import { atom } from "nanostores";
import { engine, mount, mountMode } from "../../../../tests/rig.js";
import { renderView } from "../../../../tests/render.js";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ENTRY = new URL("../buffer/Practice.svelte", import.meta.url).pathname;
const LADDER = new URL("../buffer/kit/Ladder.svelte", import.meta.url).pathname;

const { describe, it, expect, beforeAll, afterAll } = specimen;

describe("practice mode — the assembly", () => {
  it("P-manifest: coach/practice is the full agentic set with an App, a harness and four tools", () => {
    expect(practice.manifest.type).toBe("coach");
    expect([...practice.manifest.traits].sort()).toEqual(["APPLICATION", "CONVERSATIONAL", "EXPOSED", "HARNESSED", "STANDALONE", "TOOLING"]);
    expect(practice.application.mount).toBe("buffer/Practice.svelte");
    const armed = Object.keys(shape.strip(practice.tools).branches.practice.branches).sort();
    expect(armed).toEqual(["assess", "board", "elo", "move", "note"]);
  });

  it("P-bundle: Practice.svelte bundles with its kit, no chessground", { sanitizeResources: false, sanitizeOps: false }, async () => {
    const store = Deno.makeTempDirSync({ prefix: "chess-practice-" });
    const view = await paladin.bundler(store).bundle({ kind: "svelte", entry: ENTRY });
    expect(view.hash).toBeTruthy();
    const files = [];
    for await (const entry of Deno.readDir(`${store}/bundle`)) files.push(entry.name);
    const code = await Deno.readTextFile(`${store}/bundle/${files.find((name) => name.endsWith(".mjs"))}`);
    expect(code).not.toMatch(/chessground/);
    expect(code).toContain("/engine/status");
    expect(code).toContain("--sq-light:");
    await Deno.remove(store, { recursive: true });
  });
});

describe("practice mode — the coach's hands", { sanitizeResources: false, sanitizeOps: false }, () => {
  let rig;
  let coach;
  let scripted;

  beforeAll(async () => {
    scripted = engine({ plays: { [START]: { 1320: "e2e4", 1600: "e2e4", 2000: "d2d4", 2400: "d2d4", 2800: "d2d4", full: "d2d4" } } });
    rig = await mount({ engine: scripted });
    coach = await mountMode(rig, practice, { harness: () => "Nice opening move. Watch the centre." });
  });

  afterAll(async () => rig?.close());

  it("P-create: a game opens with the student's side and the coach's strength", async () => {
    const buffer = await coach.call("/practice/create", { student: "black", strength: "gentle" });
    expect(buffer.data.student).toBe("black");
    expect(buffer.data.strength).toBe("gentle");
    expect(buffer.data.turn).toBe("white");
    expect(buffer.data.status).toBe("pending");
  });

  it("P-board: practice_board speaks the position, whose move, and the legal list", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    const read = await coach.invoke("/practice/board", { buffer: buffer.id });
    expect(read.message).toMatch(/white to move \(the student\)/);
    expect(read.legal.length).toBe(20);
  });

  it("P-student-move: the student's move flips the turn and marks the coach as thinking", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    const data = await coach.call("/practice/move", { buffer: buffer.id, uci: "e2e4" });
    expect(data.sans).toEqual(["e4"]);
    expect(data.turn).toBe("black");
    expect(data.waiting).toBe(true);
    let message = null;
    try {
      await coach.call("/practice/move", { buffer: buffer.id, uci: "e7e5" });
    } catch (error) {
      message = error.message;
    }
    expect(message).toMatch(/coach's move/);
  });

  it("P-coach-move: practice_move plays only on the coach's turn, only legal, and leaves its comment", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    const early = await coach.invoke("/practice/move", { buffer: buffer.id, uci: "e7e5" });
    expect(early.condition).toBe("ERROR");
    expect(early.message).toMatch(/student's move/);
    await coach.call("/practice/move", { buffer: buffer.id, uci: "e2e4" });
    const illegal = await coach.invoke("/practice/move", { buffer: buffer.id, uci: "e7e4" });
    expect(illegal.condition).toBe("ERROR");
    expect(illegal.message).toMatch(/Legal:/);
    const played = await coach.invoke("/practice/move", { buffer: buffer.id, uci: "e7e5", comment: "Meeting the centre." });
    expect(played.san).toBe("e5");
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(held.data.waiting).toBe(false);
    expect(held.data.turn).toBe("white");
    expect(held.data.notes).toEqual([{ ply: 2, text: "Meeting the centre." }]);
  });

  it("P-assess: practice_assess reads the engine through the domain's cache", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    const assessed = await coach.invoke("/practice/assess", { buffer: buffer.id, multipv: 2 });
    expect(assessed.message).toMatch(/ScriptedFish/);
    expect(assessed.evaluation.multipv.length).toBeGreaterThan(0);
    const again = await coach.invoke("/practice/assess", { buffer: buffer.id, multipv: 2 });
    expect(again.evaluation.depth).toBe(assessed.evaluation.depth);
  });

  it("P-turn: the coach's turn streams on the harness and the brief names the student's move", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    await coach.call("/practice/move", { buffer: buffer.id, uci: "d2d4" });
    const records = [];
    for await (const record of await coach.call("/practice/turn", { buffer: buffer.id })) records.push(record);
    expect(records.length).toBe(1);
    expect(records[0].output.message).toMatch(/Nice opening/);
  });

  it("P-elo: the student's last move gets its ladder — through the tool and the door — and the buffer keeps it", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    const early = await coach.invoke("/practice/elo", { buffer: buffer.id });
    expect(early.condition).toBe("ERROR");
    expect(early.message).toMatch(/has not moved yet/);
    await coach.call("/practice/move", { buffer: buffer.id, uci: "e2e4" });
    const told = await coach.invoke("/practice/elo", { buffer: buffer.id });
    expect(told.ply).toBe(1);
    expect(told.message).toMatch(/^e4 — a club player's move\. Stockfish limited to 1600 still picks e4; at 2000 it switches to d4\./);
    const door = await coach.call("/practice/elo", { buffer: buffer.id });
    expect(door.ladder.elo).toBe(1600);
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(held.data.ladders["1"].san).toBe("e4");
    expect(Object.keys(held.data.dests).length).toBeGreaterThan(0);
  });

  it("P-reset-ask: create with a buffer resets it in place; the student's question streams the coach's answer", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    await coach.call("/practice/move", { buffer: buffer.id, uci: "e2e4" });
    const reset = await coach.call("/practice/create", { buffer: buffer.id, student: "black", strength: "strong" });
    expect(reset.id).toBe(buffer.id);
    expect(reset.data.moves).toEqual([]);
    expect(reset.data.student).toBe("black");
    expect(reset.data.strength).toBe("strong");
    const records = [];
    for await (const record of await coach.call("/practice/ask", { buffer: buffer.id, text: "why not Qxb7?" })) records.push(record);
    expect(records[0].output.message).toMatch(/Nice opening/);
  });

  it("P-render: the view server-renders the live row and the thread — seats, the rail, the coach's note, the talk, the ladder", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    await coach.call("/practice/move", { buffer: buffer.id, uci: "e2e4" });
    await coach.invoke("/practice/move", { buffer: buffer.id, uci: "e7e5", comment: "Meeting the centre." });
    await coach.call("/practice/elo", { buffer: buffer.id });
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    const turns = [
      { id: "t1", role: "user", parts: [{ type: "text", text: "The student played e4." }] },
      { id: "t2", role: "assistant", parts: [{ type: "tool_use", id: "use-1", name: "practice_assess", input: { buffer: held.id } }] },
      { id: "t3", role: "user", parts: [{ type: "tool_result", tool_use_id: "use-1", output: { message: "ScriptedFish depth 12 (black to move):\n1. 0.20 — e7e5" } }] },
      { id: "t4", role: "assistant", parts: [{ type: "text", text: "Nice opening move. Watch the centre." }] },
    ];
    const { text, body } = await renderView(ENTRY, { buffer: { id: held.id, data: held.data }, thread: { id: "thread-1", $turns: atom(turns) } });
    expect(text).toMatch(/^♞ play study riddles practice library engine coach club · assisted/);
    expect(text).toMatch(/⇅ ☰ ♪ \+ ≈ ⚑ you student white/);
    expect(text).toMatch(/talk moves 2 elo ✕ coach · 1… e5 Meeting the centre\./);
    expect(text).toMatch(/practice_assess ScriptedFish depth 12/);
    expect(text).toMatch(/Nice opening move\. Watch the centre\. send$/);
    expect(body).toMatch(/class="tab [^"]*\bactive\b[^"]*"[^>]*>practice</);
    expect(body).toMatch(/placeholder="ask the coach…"/);
    expect(body).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    // the elo tab prints the ladder the buffer keeps for the student's move
    const priced = await renderView(LADDER, { ladder: held.data.ladders["1"], label: "elo of my move", move: "1. e4" }, { raw: true });
    expect(priced.text).toMatch(/^elo of my move · 1\. e4 1600 a club player's move/);
    const stalled = await renderView(ENTRY, { buffer: { id: held.id, data: { ...held.data, waiting: true } }, thread: { id: "thread-1", $turns: atom(turns) } });
    expect(stalled.text).toMatch(/coach coach has not moved yet — ▶ asks it again/);
    expect(stalled.body).toMatch(/title="coach, move — ask the coach for its move again"/);
  });

  it("P-seal: a mate on the board seals the practice game with the coach as an assisted hallucinator seat", async () => {
    const buffer = await coach.call("/practice/create", { student: "white" });
    for (const [uci, who] of [["e2e4", "student"], ["e7e5", "coach"], ["f1c4", "student"], ["b8c6", "coach"], ["d1h5", "student"], ["g8f6", "coach"], ["h5f7", "student"]]) {
      if (who === "student") await coach.call("/practice/move", { buffer: buffer.id, uci });
      else await coach.invoke("/practice/move", { buffer: buffer.id, uci });
    }
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(held.data.status).toBe("ended");
    expect(held.data.result).toBe("1-0");
    expect(held.data.game).toBeTruthy();
    const game = await rig.entities.literal.findOne({ id: held.data.game });
    expect(game.trait.SEATED.black).toEqual({ kind: "hallucinator", assisted: true });
    const noMore = await coach.invoke("/practice/move", { buffer: buffer.id, uci: "a7a6" });
    expect(noMore.condition).toBe("ERROR");
  });
});
