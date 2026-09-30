import { specimen } from "@vivalence/typology";
import paladin from "@vivalence/paladin";
import * as library from "../games.viva.js";
import { mount, mountMode } from "../../../../tests/rig.js";
import { renderView } from "../../../../tests/render.js";

const { describe, it, expect, beforeAll, afterAll } = specimen;

const ENTRY = new URL("../buffer/Library.svelte", import.meta.url).pathname;
const IMMORTAL = '[Event "London"]\n[Site "London"]\n[Date "1851.06.21"]\n[White "Anderssen"]\n[Black "Kieseritzky"]\n[Result "1-0"]\n\n1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 1-0';
const FOOLS = '[Event "Test"]\n[White "A"]\n[Black "B"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const SCHOLAR = '[Event "Test"]\n[White "Scholar"]\n[Black "Victim"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';

describe("library mode — the assembly", () => {
  it("P-manifest: library/games is APPLICATION STANDALONE EXPOSED with an App and ten filters", () => {
    expect(library.manifest.type).toBe("library");
    expect(library.manifest.slug).toBe("games");
    expect([...library.manifest.traits].sort()).toEqual(["APPLICATION", "EXPOSED", "STANDALONE"]);
    expect(library.application.mount).toBe("buffer/Library.svelte");
    expect(library.FILTERS.length).toBe(10);
  });

  it("P-bundle: Library.svelte bundles with its kit, no chessground", { sanitizeResources: false, sanitizeOps: false }, async () => {
    const store = Deno.makeTempDirSync({ prefix: "chess-library-" });
    const view = await paladin.bundler(store).bundle({ kind: "svelte", entry: ENTRY });
    expect(view.hash).toBeTruthy();
    const files = [];
    for await (const entry of Deno.readDir(`${store}/bundle`)) files.push(entry.name);
    const code = await Deno.readTextFile(`${store}/bundle/${files.find((name) => name.endsWith(".mjs"))}`);
    expect(code).not.toMatch(/chessground/);
    expect(code).toContain("/engine/status");
    expect(code).toContain("--sq-light:");
    await Deno.remove(store, { recursive: true });
    expect(code).toContain("analysis");
  });
});

describe("library mode — the corpus in a list", { sanitizeResources: false, sanitizeOps: false }, () => {
  let rig;
  let shelf;

  beforeAll(async () => {
    rig = await mount();
    await rig.call("/game/import", { pgn: IMMORTAL, source: { provider: "test" } });
    await rig.call("/game/import", { pgn: FOOLS });
    shelf = await mountMode(rig, library);
  });

  afterAll(async () => rig?.close());

  it("P-list: a buffer opens with every game, newest first, and a filter narrows it", async () => {
    const data = await shelf.call("/library/list", {});
    expect(data.count).toBe(2);
    expect(data.games.map((game) => game.players)).toEqual(["A – B", "Anderssen – Kieseritzky"]);
    expect(data.games[1]).toMatchObject({ result: "1-0", date: "1851", event: "London", plies: 7, analysed: false, source: "test" });
    const buffer = (await rig.entities.buffer.find({ mode: shelf.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const white = await shelf.call("/library/list", { buffer: buffer.id, filter: "1-0" });
    expect(white.games.map((game) => game.players)).toEqual(["Anderssen – Kieseritzky"]);
    expect(white.count).toBe(2);
    const draws = await shelf.call("/library/list", { buffer: buffer.id, filter: "½-½" });
    expect(draws.games).toEqual([]);
    const all = await shelf.call("/library/list", { buffer: buffer.id, filter: "all" });
    expect(all.games.length).toBe(2);
  });

  it("P-import: PGN lands in the corpus with a sentence; the same PGN twice says held; junk is a sentence too", async () => {
    const opened = await shelf.call("/library/list", {});
    const buffer = (await rig.entities.buffer.find({ mode: shelf.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    const first = await shelf.call("/library/import", { buffer: buffer.id, pgn: SCHOLAR });
    expect(first.sentence).toMatch(/^1 game imported · \d classified · positions reached$/);
    expect(first.tone).toBe("success");
    expect(first.count).toBe(opened.count + 1);
    expect(first.games[0].players).toBe("Scholar – Victim");
    const again = await shelf.call("/library/import", { buffer: buffer.id, pgn: SCHOLAR });
    expect(again.sentence).toBe("already held — nothing duplicated.");
    expect(again.tone).toBe("warning");
    const blank = await shelf.call("/library/import", { buffer: buffer.id, pgn: "   " });
    expect(blank.sentence).toBe("paste a PGN first.");
  });

  it("P-render: the view server-renders the list — chips, the import field, one row per game with open →", async () => {
    await shelf.call("/library/list", {});
    const buffer = (await rig.entities.buffer.find({ mode: shelf.row.id }, { orderBy: { createdAt: "DESC" }, limit: 1 }))[0];
    await shelf.call("/library/import", { buffer: buffer.id, pgn: SCHOLAR });
    const held = await rig.entities.buffer.findOne({ id: buffer.id });
    const { text, body } = await renderView(ENTRY, { buffer: { id: held.id, data: held.data } });
    expect(text).toMatch(/^♞ play study riddles practice library engine all/);
    expect(text).toMatch(/all result\.1-0 result\.0-1 result\.½-½ analysed opening\.eco\.A/);
    expect(text).toMatch(/import/);
    expect(text).toMatch(/already held — nothing duplicated\./);
    expect(text).toMatch(/3 of 3 games ↺ all paste a PGN to import · click a game to study it$/);
    expect(body).toMatch(/<button disabled title="clear the filter"/);
    expect(text).toMatch(/Anderssen – Kieseritzky 1-0 London 1851 7 open →/);
    expect(text).toMatch(/Scholar – Victim 1-0/);
    expect(body).toMatch(/class="tab [^"]*\bactive\b[^"]*"[^>]*>library</);
    expect(body).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
