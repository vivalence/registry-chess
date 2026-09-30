import { specimen } from "@vivalence/typology";
import paladin from "@vivalence/paladin";
import * as analysis from "../analysis.viva.js";
import { engine, mount, mountMode } from "../../../../tests/rig.js";
import { renderView } from "../../../../tests/render.js";

const { describe, it, expect, beforeAll, afterAll } = specimen;

const PGN = '[Event "Test"]\n[Site "London"]\n[Date "1851.06.21"]\n[White "Anderssen"]\n[Black "Kieseritzky"]\n[Result "1-0"]\n\n1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 1-0';
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ENTRY = new URL("../buffer/Analysis.svelte", import.meta.url).pathname;
const LADDER = new URL("../buffer/kit/Ladder.svelte", import.meta.url).pathname;

describe("analysis mode — the assembly", () => {
  it("P-manifest: study/analysis is APPLICATION STANDALONE EXPOSED HARNESSED with an App", () => {
    expect(analysis.manifest.type).toBe("study");
    expect([...analysis.manifest.traits].sort()).toEqual(["APPLICATION", "EXPOSED", "HARNESSED", "STANDALONE"]);
    expect(analysis.application.mount).toBe("buffer/Analysis.svelte");
  });

  it("P-bundle: Analysis.svelte bundles with its kit, no chessground", { sanitizeResources: false, sanitizeOps: false }, async () => {
    const store = Deno.makeTempDirSync({ prefix: "chess-analysis-" });
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

describe("analysis mode — a study through the aperture", { sanitizeResources: false, sanitizeOps: false }, () => {
  let rig;
  let study;
  let scripted;

  beforeAll(async () => {
    // the ladder at the start: weak searches play e4, strong ones d4
    scripted = engine({ plays: { [START]: { 1320: "e2e4", 1600: "e2e4", 2000: "d2d4", 2400: "d2d4", 2800: "d2d4", full: "d2d4" } } });
    rig = await mount({ engine: scripted });
    study = await mountMode(rig, analysis, { harness: () => ({ explanation: "The bishop check was met by the king walk; the engine wanted the knight out." }) });
  });

  afterAll(async () => rig?.close());

  it("P-load: PGN lands on a new buffer laid out as fens + sans, cursor at the start", async () => {
    const buffer = await study.call("/analysis/load", { pgn: PGN });
    expect(buffer.data.title).toBe("Anderssen – Kieseritzky 1-0");
    expect(buffer.data.tags.Site).toBe("London");
    expect(buffer.data.ladders).toEqual({});
    expect(buffer.data.moves.length).toBe(7);
    expect(buffer.data.sans).toEqual(["e4", "e5", "f4", "exf4", "Bc4", "Qh4+", "Kf1"]);
    expect(buffer.data.fens.length).toBe(8);
    expect(buffer.data.cursor).toBe(0);
    expect(buffer.data.status).toBe("idle");
  });

  it("P-seek: the cursor clamps to the line", async () => {
    const buffer = await study.call("/analysis/load", { pgn: PGN });
    expect((await study.call("/analysis/seek", { buffer: buffer.id, ply: 3 })).cursor).toBe(3);
    expect((await study.call("/analysis/seek", { buffer: buffer.id, ply: 99 })).cursor).toBe(7);
    expect((await study.call("/analysis/seek", { buffer: buffer.id, ply: -4 })).cursor).toBe(0);
  });

  it("P-run: the engine walks every position, progress streams, the report lands on the buffer", async () => {
    const buffer = await study.call("/analysis/load", { pgn: PGN });
    const records = [];
    for await (const record of await study.call("/analysis/run", { buffer: buffer.id, depth: 6 })) records.push(record);
    expect(records.filter((record) => record.stage === "eval").length).toBe(8);
    expect(records.at(-1).stage).toBe("done");
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(held.data.status).toBe("done");
    expect(held.data.report.judgements.length).toBe(7);
    expect(held.data.report.accuracy.white).toBeGreaterThan(0);
  });

  it("P-corpus: a game from the corpus loads by id, binds the literal, and a run stamps it ANALYSED", async () => {
    const imported = await rig.call("/game/import", { pgn: PGN });
    const buffer = await study.call("/analysis/load", { game: imported.games[0].id });
    expect(buffer.data.game).toBe(imported.games[0].id);
    for await (const _ of await study.call("/analysis/run", { buffer: buffer.id, depth: 4 }));
    const game = await rig.entities.literal.findOne({ id: imported.games[0].id });
    expect(game.traits).toContain("ANALYSED");
    const held = await rig.entities.buffer.findOne({ id: buffer.id }, { populate: ["literals"] });
    expect(held.literals.getItems().map((row) => row.id)).toEqual([imported.games[0].id]);
  });

  it("P-explain: the hallucinator's words land per ply; asking before a run is a sentence", async () => {
    const fresh = await study.call("/analysis/load", { pgn: PGN });
    let message = null;
    try {
      await study.call("/analysis/explain", { buffer: fresh.id, ply: 6 });
    } catch (error) {
      message = error.message;
    }
    expect(message).toMatch(/run the analysis first/);
    for await (const _ of await study.call("/analysis/run", { buffer: fresh.id, depth: 4 }));
    const told = await study.call("/analysis/explain", { buffer: fresh.id, ply: 6 });
    expect(told.explanation).toMatch(/bishop check/);
    const held = await rig.entities.buffer.findOne({ id: fresh.id });
    expect(held.data.explanations["6"]).toBe(told.explanation);
  });

  it("P-elo: the ladder for a ply lands on the buffer; off the line is a sentence", async () => {
    const buffer = await study.call("/analysis/load", { pgn: PGN });
    const { ladder } = await study.call("/analysis/elo", { buffer: buffer.id, ply: 1 });
    expect(ladder.san).toBe("e4");
    expect(ladder.elo).toBe(1600);
    expect(ladder.switches.san).toBe("d4");
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    expect(held.data.ladders["1"].elo).toBe(1600);
    let refused = null;
    try {
      await study.call("/analysis/elo", { buffer: buffer.id, ply: 40 });
    } catch (error) {
      refused = error.message;
    }
    expect(refused).toMatch(/ply 40 is not on the board/);
  });

  it("P-render: the view server-renders an analysed row — the eval bar, the rail, the report panel, and the ladder its elo tab shows", async () => {
    const buffer = await study.call("/analysis/load", { pgn: PGN });
    for await (const _ of await study.call("/analysis/run", { buffer: buffer.id, depth: 4 }));
    await study.call("/analysis/elo", { buffer: buffer.id, ply: 1 });
    await study.call("/analysis/seek", { buffer: buffer.id, ply: 1 });
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    const { text, body } = await renderView(ENTRY, { buffer: { id: held.id, data: held.data } });
    expect(text).toMatch(/^♞ play study riddles practice library engine Kieseritzky black/);
    expect(text).toMatch(/⇅ ☰ ♪ ↺ ‹ › » ≈ Anderssen white report moves elo ✕/);
    expect(text).toMatch(/Anderssen – Kieseritzky 1-0 london · 1851 · 1-0/);
    expect(text).toMatch(/white · accuracy [\d.]+ % black · accuracy [\d.]+ %/);
    expect(text).toMatch(/1\. e4 · \w+ · [\d.]+% → [\d.]+% · engine: \w+/);
    expect(body).toMatch(/class="evalbar/);
    expect(body).toMatch(/class="tab [^"]*\bactive\b[^"]*"[^>]*>study</);
    const priced = await renderView(LADDER, { ladder: held.data.ladders["1"], move: "1. e4" }, { raw: true });
    expect(priced.text).toMatch(/^elo of this move · 1\. e4 1600 a club player's move/);
    expect(body).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(body).toMatch(/<div class="chess[^"]*" tabindex="-1"/);
  });

  it("P-no-engine: without an engine the run fails with the domain's sentence and the buffer says so", async () => {
    const services = rig.daemon.services;
    rig.daemon.services = {};
    try {
      const buffer = await study.call("/analysis/load", { pgn: PGN });
      const records = [];
      for await (const record of await study.call("/analysis/run", { buffer: buffer.id })) records.push(record);
      expect(records.at(-1).stage).toBe("failed");
      expect(records.at(-1).message).toMatch(/consume\.engine/);
      const held = await rig.entities.buffer.findOne({ id: buffer.id });
      expect(held.data.status).toBe("failed");
    } finally {
      rig.daemon.services = services;
    }
  });
});
