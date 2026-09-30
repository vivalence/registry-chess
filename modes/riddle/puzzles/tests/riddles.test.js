import { specimen } from "@vivalence/typology";
import paladin from "@vivalence/paladin";
import * as riddles from "../puzzles.viva.js";
import { engine, mount, mountMode } from "../../../../tests/rig.js";
import { renderView } from "../../../../tests/render.js";

const ENTRY = new URL("../buffer/Riddles.svelte", import.meta.url).pathname;

const { describe, it, expect, beforeAll, afterAll } = specimen;

// two riddles the rig poses: a one-mover and a two-mover (the opponent replies in between)
const SCHOLAR = { id: "scholar", fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", solution: ["h5f7"], rating: 600, themes: ["mate-in-1"] };
// white: Qxh7+ Kxh7 (forced), then Rh3# — a two-mover with the reply played for the solver
const TWO = {
  id: "two",
  fen: "5rk1/5ppp/8/8/8/7R/5PPP/4Q1K1 w - - 0 1",
  solution: ["e1e7", "f8e8", "e7e8"],
  rating: 1500,
  themes: ["mate-in-2"],
};

describe("riddle mode — the assembly", () => {
  it("P-manifest: riddle/puzzles is APPLICATION STANDALONE EXPOSED with an App", () => {
    expect(riddles.manifest.type).toBe("riddle");
    expect([...riddles.manifest.traits].sort()).toEqual(["APPLICATION", "EXPOSED", "STANDALONE"]);
    expect(riddles.application.mount).toBe("buffer/Riddles.svelte");
    expect(riddles.LEVELS).toEqual(["novice", "apprentice", "club", "expert", "master"]);
  });

  it("P-bundle: Riddles.svelte bundles with its kit, no chessground", { sanitizeResources: false, sanitizeOps: false }, async () => {
    const store = Deno.makeTempDirSync({ prefix: "chess-riddles-" });
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

describe("riddle mode — solving through the aperture", { sanitizeResources: false, sanitizeOps: false }, () => {
  let rig;
  let riddle;

  // the engine answers the one position a test scripts in `lines`; the rest fall back to legal moves
  const lines = {};

  beforeAll(async () => {
    rig = await mount({ engine: engine({ lines }) });
    await rig.entities.literal.pose(SCHOLAR);
    await rig.entities.literal.pose(TWO);
    riddle = await mountMode(rig, riddles);
  });

  afterAll(async () => rig?.close());

  it("P-open: a buffer opens at a level with the first riddle served, solution withheld", async () => {
    const data = await riddle.call("/riddle/open", { level: "novice" });
    expect(data.status).toBe("solving");
    expect(data.puzzle.slug).toBe("puzzle-scholar");
    expect(data.puzzle.solution).toBeUndefined();
    expect(data.fen).toBe(SCHOLAR.fen);
    expect(data.seen).toEqual([data.puzzle.id]);
  });

  it("P-solve: the right move solves, the tally and streak move, the solution is revealed", async () => {
    const opened = await riddle.call("/riddle/open", { level: "novice" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    expect(Object.keys(opened.dests)).toContain("h5");
    const data = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "h5f7" });
    expect(data.status).toBe("solved");
    expect(data.solved).toBe(1);
    expect(data.streak).toBe(1);
    expect(data.solution).toEqual(["h5f7"]);
    expect(data.line).toEqual(["Qxf7#"]);
    expect(data.dests).toEqual({});
    expect(opened.puzzle.id).toBe(data.puzzle.id);
  });

  it("P-fail: a wrong move fails, resets the streak and reveals the line", async () => {
    await riddle.call("/riddle/open", { level: "novice" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const data = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "h5h7" });
    expect(data.status).toBe("failed");
    expect(data.failed).toBe(1);
    expect(data.streak).toBe(0);
    expect(data.solution).toEqual(["h5f7"]);
    expect(data.missed).toBe("h5h7");
    const back = await riddle.call("/riddle/again", { buffer: buffer.id });
    expect(back.status).toBe("solving");
    expect(back.fen).toBe(SCHOLAR.fen);
    expect(back.failed).toBe(1);
    expect(back.line).toBeUndefined();
  });

  it("P-reveal: giving up plays the line out, counts as failed, resets the streak", async () => {
    await riddle.call("/riddle/open", { level: "novice" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const shown = await riddle.call("/riddle/reveal", { buffer: buffer.id });
    expect(shown.status).toBe("failed");
    expect(shown.played).toEqual(["h5f7"]);
    expect(shown.line).toEqual(["Qxf7#"]);
    expect(shown.fen).not.toBe(SCHOLAR.fen);
    expect(shown.missed).toBeUndefined();
  });

  it("P-open-in-place: open with a buffer starts that buffer over at the level", async () => {
    const opened = await riddle.call("/riddle/open", { level: "novice" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const again = await riddle.call("/riddle/open", { buffer: buffer.id, level: "club" });
    expect(again.level).toBe("club");
    expect(again.puzzle.slug).toBe("puzzle-two");
    expect(again.seen).toEqual([opened.puzzle.id, again.puzzle.id]);
  });

  it("P-reply: a two-mover plays the opponent's reply for the solver, then solves on the second move", async () => {
    await riddle.call("/riddle/open", { level: "club" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const first = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "e1e7" });
    expect(first.status).toBe("solving");
    expect(first.played).toEqual(["e1e7", "f8e8"]);
    expect(first.fen.split(" ")[1]).toBe("w");
    const second = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "e7e8" });
    expect(second.status).toBe("solved");
  });

  it("P-hint: a nudge names the from-square and costs the streak", async () => {
    await riddle.call("/riddle/open", { level: "novice" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const nudged = await riddle.call("/riddle/hint", { buffer: buffer.id });
    expect(nudged.hint).toBe("h5");
    expect(nudged.nudges).toBe(1);
    expect(nudged.streak).toBe(0);
    const data = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "h5f7" });
    expect(data.status).toBe("solved");
    expect(data.streak).toBe(0);
  });

  it("P-next: skipping a riddle counts as failed; an exhausted level says so", async () => {
    await riddle.call("/riddle/open", { level: "club" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const skipped = await riddle.call("/riddle/next", { buffer: buffer.id });
    expect(skipped.failed).toBe(1);
    expect(skipped.status).toBe("idle");
    expect(skipped.puzzle).toBeUndefined();
  });

  it("P-mistake: a wrong move says what was played, what was wanted, and — with an engine — why it fails", async () => {
    // positions no other test plays into: the domain caches an evaluation per position
    const services = rig.daemon.services;
    rig.daemon.services = {};
    let blind;
    try {
      await riddle.call("/riddle/open", { level: "novice" });
      const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
      blind = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "h5g5" });
    } finally {
      rig.daemon.services = services;
    }
    expect(blind.mistake).toEqual({ ply: 1, san: "Qg5", wanted: "Qxf7#" });
    // the queen guards f7, so the king walks: black to move, scored from black's side (-1.5), so +1.5 for the solver
    lines["r1bqkb1r/pppp1Bpp/2n2n2/4p2Q/4P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"] = [{ cp: -150, pv: ["e8e7", "f7b3"] }];
    await riddle.call("/riddle/open", { level: "novice" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const seen = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "c4f7" });
    expect(seen.mistake).toEqual({ ply: 1, san: "Bxf7+", wanted: "Qxf7#", refutation: { sans: ["Ke7", "Bb3"], cp: 150 } });
    const { text, body } = await renderView(ENTRY, { buffer: { id: buffer.id, data: seen } });
    expect(text).toMatch(/not Bxf7\+ you played 4\. Bxf7\+ — the riddle wanted Qxf7# the engine's line: 4… Ke7 5\. Bb3 — \+1\.5 for you the line: 4\. Qxf7# the streak resets › next riddle ↺ try again lichess ↗/);
    // the move played in red (c4 · f7), the move wanted in green where it does not overlap (h5)
    expect((body.match(/class="sq [^"]*\bbad\b/g) ?? []).length).toBe(2);
    expect((body.match(/class="sq [^"]*\bgood\b/g) ?? []).length).toBe(1);
    const back = await riddle.call("/riddle/again", { buffer: buffer.id });
    expect(back.mistake).toBeUndefined();
  });

  it("P-miss-again: the wrong move stands on the board; again is a replay that moves no tally", async () => {
    await riddle.call("/riddle/open", { level: "novice" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const missed = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "h5h7" });
    expect(missed.status).toBe("failed");
    expect(missed.fen).not.toBe(SCHOLAR.fen);
    expect(missed.fen.split(" ")[1]).toBe("b");
    expect(missed.failed).toBe(1);
    const back = await riddle.call("/riddle/again", { buffer: buffer.id });
    expect(back.replay).toBe(true);
    expect(back.fen).toBe(SCHOLAR.fen);
    expect(back.missed).toBeUndefined();
    const solved = await riddle.call("/riddle/move", { buffer: buffer.id, uci: "h5f7" });
    expect(solved.status).toBe("solved");
    expect(solved.solved ?? 0).toBe(0);
    expect(solved.streak ?? 0).toBe(0);
    expect(solved.failed).toBe(1);
    const served = await riddle.call("/riddle/next", { buffer: buffer.id });
    expect(served.replay).toBe(false);
    expect(served.failed).toBe(1);
  });

  it("P-level-switch: changing level mid-solve is not a failure; a plain skip still is", async () => {
    await riddle.call("/riddle/open", { level: "club" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const switched = await riddle.call("/riddle/next", { buffer: buffer.id, level: "novice" });
    expect(switched.level).toBe("novice");
    expect(switched.failed ?? 0).toBe(0);
    expect(switched.status).toBe("solving");
    const skipped = await riddle.call("/riddle/next", { buffer: buffer.id });
    expect(skipped.failed).toBe(1);
  });

  it("P-render: the view server-renders a riddle on the board — seats, the rail, the note, the level panel", async () => {
    await riddle.call("/riddle/open", { level: "club" });
    const buffer = (await rig.entities.buffer.find({ mode: riddle.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    await riddle.call("/riddle/hint", { buffer: buffer.id });
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    const { text, body } = await renderView(ENTRY, { buffer: { id: held.id, data: held.data } });
    expect(text).toMatch(/^♞ play study riddles practice library engine riddle \d+ club · 1500/);
    expect(text).toMatch(/⇅ ☰ ♪ ↺ \? ◉ › you white to move riddle ✕/);
    expect(text).toMatch(/white to move · find the idea the ♛ on e1 moves\. streak gone\. \? nudge ◉ reveal › skip level/);
    expect(body).toMatch(/title="shows the piece · costs the streak" disabled/);
    expect(text).toMatch(/level 1 2 3 4 5 club · 1400–1800/);
    expect(text).toMatch(/streak 0 solved \d+ · failed \d+ · nudged \d+/);
    expect(text).toMatch(/mate-in-2/);
    expect(body).toMatch(/class="tab [^"]*\bactive\b[^"]*"[^>]*>riddles</);
    expect(body).toMatch(/class="sq [^"]*\bhint\b/);
    expect(body).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("P-traces: every finished riddle left a trace for the user", async () => {
    const traces = await rig.entities.trace.find({ user: rig.user.id, kind: "puzzle" });
    expect(traces.length).toBeGreaterThanOrEqual(4);
    expect(new Set(traces.map((trace) => trace.status))).toEqual(new Set(["SOLVED", "FAILED"]));
  });
});
