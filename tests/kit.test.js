import { specimen } from "@vivalence/typology";
import paladin from "@vivalence/paladin";
import { contrast, design, THEMES } from "@vivalence/dapper";
import { compile } from "svelte/compiler";
import { renderView } from "./render.js";

const { describe, it, expect } = specimen;

const ROOT = new URL("../modes/", import.meta.url).pathname;
const KIT = ["Board.svelte", "Nav.svelte", "Seat.svelte", "Moves.svelte", "Theme.svelte", "Shell.svelte", "Ladder.svelte", "layout.js", "material.js", "open.js", "sound.js"];
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// every mode that carries a kit
const carriers = async () => {
  const found = [];
  for await (const type of Deno.readDir(ROOT)) {
    if (!type.isDirectory) continue;
    for await (const slug of Deno.readDir(`${ROOT}${type.name}`)) {
      if (!slug.isDirectory) continue;
      try {
        await Deno.stat(`${ROOT}${type.name}/${slug.name}/buffer/kit`);
        found.push(`${ROOT}${type.name}/${slug.name}`);
      } catch {}
    }
  }
  return found.sort();
};

describe("the kit — one copy per mode, pinned equal", () => {
  it("P-kit-equal: every chess mode carries the same Board · Nav · Seat · Moves · Theme · Shell · Ladder · layout.js · material.js · open.js · sound.js", async () => {
    const modes = await carriers();
    expect(modes.map((mode) => mode.slice(ROOT.length))).toEqual(["board/play", "coach/practice", "library/games", "riddle/puzzles", "study/analysis"]);
    const [reference, ...others] = modes;
    for (const file of KIT) {
      const canon = await Deno.readTextFile(`${reference}/buffer/kit/${file}`);
      for (const mode of others) {
        const copy = await Deno.readTextFile(`${mode}/buffer/kit/${file}`);
        expect(copy === canon, `${mode.slice(ROOT.length)}/buffer/kit/${file} drifted from ${reference.slice(ROOT.length)}`).toBe(true);
      }
    }
  });

  it("P-kit-opens: open.js names the five tabs and finds a sibling by type and slug", async () => {
    const [reference] = await carriers();
    const kit = await import(`file://${reference}/buffer/kit/open.js`);
    expect(kit.TABS.map((tab) => tab.label)).toEqual(["play", "study", "riddles", "practice", "library"]);
    const daemon = { entities: { mode: { $entities: { get: () => [{ id: "m1", type: "study", slug: "analysis" }] } } } };
    expect(kit.sibling(daemon, kit.TABS[1]).id).toBe("m1");
    expect(kit.sibling(daemon, kit.TABS[0])).toBe(null);
  });

  it("P-kit-compiles: each component compiles for the client with no warnings", async () => {
    const [reference] = await carriers();
    for (const file of KIT.filter((name) => name.endsWith(".svelte"))) {
      const out = compile(await Deno.readTextFile(`${reference}/buffer/kit/${file}`), { generate: "client", filename: file });
      expect(out.warnings.map((warning) => `${file}: ${warning.message}`)).toEqual([]);
    }
  });

  it("P-kit-no-hex: the kit names colours by token only", async () => {
    const [reference] = await carriers();
    for (const file of KIT) {
      const text = await Deno.readTextFile(`${reference}/buffer/kit/${file}`);
      expect(text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    }
  });

  it("P-board-renders: the start position prints 64 squares, 32 glyphs, both coordinate rails", async () => {
    const [reference] = await carriers();
    const { body } = await renderView(`${reference}/buffer/kit/Board.svelte`, { fen: START, dests: { e2: ["e3", "e4"], g1: ["f3", "h3"] }, movable: true }, { raw: true });
    expect((body.match(/class="sq /g) ?? []).length).toBe(64);
    expect((body.match(/♟/g) ?? []).length).toBe(16);
    expect((body.match(/♞/g) ?? []).length).toBe(4);
    // the corner carries both rails in one coord; the rest one each
    for (const coord of ["a1", "h", "8", "2"]) expect(body).toMatch(new RegExp(`class="coord[^"]*">${coord}<`));
    expect((body.match(/class="sq [^"]*grab/g) ?? []).length).toBe(2);
  });

  it("P-theme-ships: the served bundle of every view carries the kit's variable definitions, every theme override and the pulse", { sanitizeResources: false, sanitizeOps: false }, async () => {
    const [reference] = await carriers();
    const named = [...new Set([...(await Deno.readTextFile(`${reference}/buffer/kit/Theme.svelte`)).matchAll(/data-theme="([a-z0-9-]+)"/g)].map((match) => match[1]))];
    expect(named.length > 0).toBe(true);
    for (const mode of await carriers()) {
      const store = await Deno.makeTempDir({ prefix: "chess-theme-" });
      const views = [];
      for await (const entry of Deno.readDir(`${mode}/buffer`)) if (entry.name.endsWith(".svelte")) views.push(entry.name);
      expect(views.length).toBe(1);
      const view = await paladin.bundler(store).bundle({ kind: "svelte", entry: `${mode}/buffer/${views[0]}` });
      const code = await Deno.readTextFile(`${store}/bundle${view.mount}`);
      await Deno.remove(store, { recursive: true });
      const where = mode.slice(ROOT.length);
      expect(code.includes("--sq-light:"), `${where}: the square tokens never reached the bundle`).toBe(true);
      expect(code.includes("--boundary-strong"), `${where}: the dapper tokens never reached the bundle`).toBe(true);
      for (const name of named) expect(new RegExp(`data-theme=\\\\?"${name}\\\\?"\\] \\.chess`).test(code), `${where}: the ${name} override never reached the bundle`).toBe(true);
      expect(/@keyframes chess-pulse/.test(code), `${where}: the pulse keyframes were renamed or dropped`).toBe(true);
      expect(/\.chess \.segment\b/.test(code), `${where}: the shared rules never reached the bundle`).toBe(true);
      expect(/\.square[^{]*\{[^}]*aspect-ratio:\s*1/.test(code), `${where}: the shell's board square never reached the bundle`).toBe(true);
    }
  });

  it("P-theme-reads: in every dapper theme the white piece reads lighter than the black, the light square lighter than the dark, and the two squares apart", async () => {
    const [reference] = await carriers();
    const style = (await Deno.readTextFile(`${reference}/buffer/kit/Theme.svelte`)).split("<style>")[1].replace(/\/\*[\s\S]*?\*\//g, "");
    const sheet = (await design()).output.css;
    const declared = (text) => Object.fromEntries([...text.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]));
    const lighter = (first, second) => contrast(first, "#FFFFFF") < contrast(second, "#FFFFFF");
    for (const name of Object.keys(THEMES)) {
      const start = sheet.indexOf(`:root[data-theme="${name}"] {`);
      const root = declared(sheet.slice(start, sheet.indexOf("}", start)));
      const chess = {};
      for (const [, selectors, body] of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const hit = selectors.split(",").map((selector) => selector.trim()).some((selector) => selector === ":global(.chess)" || selector === `:global(:root[data-theme="${name}"] .chess)`);
        if (hit) Object.assign(chess, declared(body));
      }
      const [white, black, light, dark] = ["--pw", "--pb", "--sq-light", "--sq-dark"].map((key) => root[/^var\((--[a-z0-9-]+)\)$/.exec(chess[key])[1]]);
      expect(lighter(white, black), `${name}: the white piece ${white} reads darker than the black ${black}`).toBe(true);
      expect(lighter(light, dark), `${name}: the light square ${light} reads darker than the dark ${dark}`).toBe(true);
      expect(contrast(light, dark) >= 1.3, `${name}: the squares ${light} and ${dark} read alike`).toBe(true);
    }
  });

  it("P-nav-renders: the bar prints the five tabs with the host's tab active and an engine dot", async () => {
    const [reference] = await carriers();
    const { text, body } = await renderView(`${reference}/buffer/kit/Nav.svelte`, { active: "riddle", terminal: {}, daemon: {} }, { raw: true });
    expect(text).toMatch(/^♞ play study riddles practice library engine$/);
    expect(body).toMatch(/class="tab [^"]*\bactive\b[^"]*"[^>]*>riddles</);
    expect(body).not.toMatch(/class="tab [^"]*\bactive\b[^"]*"[^>]*>play</);
    // narrow folds the knight and the dot's word away; the tabs and the dot stay
    const folded = await renderView(`${reference}/buffer/kit/Nav.svelte`, { active: "riddle", terminal: {}, daemon: {}, narrow: true }, { raw: true });
    expect(folded.text).toBe("play study riddles practice library");
    expect(folded.body).toMatch(/class="dot/);
  });

  it("P-layout: the dock sits beside on landscape, under on portrait, over the board's foot on a phone; the rail leaves the board's side for a bar under it", async () => {
    const [reference] = await carriers();
    const { place } = await import(`file://${reference}/buffer/kit/layout.js`);
    expect(place({ width: 1400, height: 900 })).toEqual({ cover: false, rail: 36, bar: 0, narrow: false, pad: 13, lift: 0 });
    expect(place({ width: 900, height: 1400 })).toEqual({ cover: false, rail: 36, bar: 0, narrow: true, pad: 13, lift: 0 });
    // a phone takes the rail off the board's side and lays it under as a bar; the sheet lifts the
    // board by its own height while the board keeps its floor…
    expect(place({ width: 700, height: 900 })).toEqual({ cover: true, rail: 0, bar: 44, narrow: true, pad: 10, lift: 320 });
    // …and overlaps it once it cannot
    expect(place({ width: 700, height: 600 }).lift).toBe(191);
    expect(place({ width: 700, height: 900, shown: false }).lift).toBe(0);
    // a wider dock tips a square-ish buffer from beside to under
    expect(place({ width: 1200, height: 1000, dockWidth: 300 }).narrow).toBe(false);
    expect(place({ width: 1200, height: 1000, dockWidth: 520, dockHeight: 200 }).narrow).toBe(true);
  });

  it("P-material: the pile each seat lost is read off the position, and the lead counts the board, not the pile", async () => {
    const [reference] = await carriers();
    const { captures } = await import(`file://${reference}/buffer/kit/material.js`);
    // the start position: nothing lost, nobody ahead
    expect(captures({ fen: START })).toEqual({ lost: { white: [], black: [] }, edge: { white: 0, black: 0 } });
    expect(captures({}).lost.white).toEqual([]);
    // two white pawns and one black pawn off: black leads by one
    const pawns = captures({ fen: "rnbqkbnr/pppp1ppp/8/8/8/8/PPP2PPP/RNBQKBNR w KQkq - 0 1" });
    expect(pawns.lost.white.length).toBe(2);
    expect(pawns.lost.black.length).toBe(1);
    expect(pawns.edge).toEqual({ white: -1, black: 1 });
    // the queen is nine, and the pile reads big to small
    const queen = captures({ fen: "rnb1kbnr/ppp2ppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
    expect(queen.edge.white).toBe(9 + 2);
    expect(queen.lost.black.join("")).toBe("\u265b\ufe0e\u265f\ufe0e\u265f\ufe0e");
    // a promoted pawn reads as a pawn lost — what the pile on the table would hold — while the
    // lead counts the queen that is really on the board
    const promoted = captures({ fen: "rnbqkbnr/ppppppQp/8/8/8/8/PPPPPPP1/RNBQKBNR w KQkq - 0 1" });
    expect(promoted.lost.white).toEqual(["\u265f\ufe0e"]);
    expect(promoted.edge.white).toBe(9);
    // every glyph carries the text-presentation selector, or iOS draws a colour pawn
    expect(promoted.lost.white.every((glyph) => glyph.endsWith("\ufe0e"))).toBe(true);
  });

  it("P-ladder-renders: the elo panel prints the verdict, every rung and the sample note; without a ladder, the way to one", async () => {
    const [reference] = await carriers();
    const rung = (elo, uci, san, plays, share) => ({ elo, uci, san, plays, share, hold: 1, agrees: share >= 0.5, cached: false });
    const ladder = {
      elo: 1600,
      verdict: "a club player's move",
      sentence: "Stockfish limited to 1600 still picks e4 in 4 of 5 searches; at 2000 it switches to d4.",
      settled: false,
      hits: 2,
      rungs: [rung(1320, "a2a3", "a3", ["a2a3"], 0), rung(1600, "e2e4", "e4", ["e2e4", "e2e4", "e2e4", "e2e4", "d2d4"], 0.8), rung("full", "d2d4", "d4", ["d2d4"], 0)],
    };
    const { text, body } = await renderView(`${reference}/buffer/kit/Ladder.svelte`, { ladder, label: "elo of my move", move: "1. e4" }, { raw: true });
    expect(text).toMatch(/^elo of my move · 1\. e4 1600 a club player's move 1320 a3 1600 e4 4\/5 full d4 Stockfish limited to 1600/);
    expect(text).toMatch(/several moves are equal, so the number is a sample/);
    expect(text).toMatch(/7 searches · 2\/3 cached$/);
    expect(body).toMatch(/grid-template-columns: repeat\(3, 1fr\)/);
    const none = await renderView(`${reference}/buffer/kit/Ladder.svelte`, { ladder: null, empty: "play a move first." }, { raw: true });
    expect(none.text).toBe("play a move first.");
  });
});
