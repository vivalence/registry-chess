import { host } from "@vivalence/sheets";
import { testRender } from "@opentui/solid";
import { BoxRenderable, createCliRenderer, ImageRenderable, NativeImage, RGBA, TextRenderable } from "@opentui/core";
import { ScaledImage } from "../buffer/scaled.js";
import { setRendererCapabilities } from "npm:@opentui/core@0.5.17/testing";
import { PassThrough, Writable } from "node:stream";
import { atom } from "nanostores";
import { mime, specimen } from "@vivalence/typology";
import { tokens } from "@vivalence/dapper";
import paladin from "@vivalence/paladin";
import { adequate, fit, GUTTER, protocol, rendered } from "../buffer/render.js";
import { grounds, inks } from "../buffer/tones.js";
import { AUTHORED, SEXTANTS, sprite } from "../buffer/raster.js";
import { FORMS } from "../buffer/pieces/forms.js";
import { painted } from "../buffer/picture.js";

const { describe, it, expect } = specimen;

const ENTRY = new URL("../buffer/play.jsx", import.meta.url).pathname;
const STORE = Deno.makeTempDirSync({ prefix: "play-tty-render-" });
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const SEATS = { white: { kind: "user" }, black: { kind: "engine", elo: 1600, movetime: 600 } };
const PALETTE = tokens.camel("porcelain", "1");
const NORTHSEA = tokens.camel("northsea", "1");
const CELL = { width: 7, height: 20 };
const ITERM = { kitty_graphics: true, sixel: true, terminal: { name: "iTerm2", version: "3.6.9", from_xtversion: true } };
const KITTY = { kitty_graphics: true, terminal: { name: "kitty", version: "0.40", from_xtversion: true } };

const settle = async (setup, passes = 6) => {
  for (let pass = 0; pass < passes; pass++) {
    await setup.renderOnce();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const match = { variant: "standard", initial: START, fen: START, moves: [], sans: [], seats: SEATS, status: "pending", turn: "white", dests: { e2: ["e3", "e4"], g1: ["f3", "h3"] }, check: false, rewindable: false, offers: {}, marks: [], variations: [], clock: { initial: 180, increment: 2, white: 180, black: 180 } };
const afterE4 = { ...match, fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", moves: ["e2e4"], sans: ["e4"], status: "playing", turn: "black", dests: {} };
const afterE5 = { ...afterE4, fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2", moves: ["e2e4", "e7e5"], sans: ["e4", "e5"], turn: "white", dests: { g1: ["f3", "h3"], e1: ["e2"] } };
const engineWhite = { ...match, seats: { white: { kind: "engine", elo: 1320, movetime: 600 }, black: { kind: "user" } }, dests: {} };
const promoting = { ...match, fen: "8/P6k/8/8/8/8/8/K7 w - - 0 1", status: "playing", dests: { a7: ["a8"], a1: ["a2", "b1", "b2"] } };
const mated = { ...match, fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", moves: ["f2f3", "e7e5", "g2g4", "d8h4"], sans: ["f3", "e5", "g4", "Qh4#"], status: "ended", result: "0-1", reason: "checkmate", check: true, dests: {} };

const door = (calls, seeded) => ({
  "/match/create": (input) => ({ id: "B1", data: { ...seeded, seats: input.seats } }),
  "/match/move": () => afterE4,
  "/match/step": () => ({ moved: true, data: afterE5 }),
  "/match/view": (input, data) => ({ ...data, ...("orientation" in input && { orientation: input.orientation }), ...("render" in input && { render: input.render }) }),
  "/match/seat": (input, data) => ({ ...data, seats: { ...data.seats, [input.side]: input.occupant } }),
  "/match/resign": (input, data) => ({ ...data, status: "ended", result: "0-1", reason: "resignation" }),
  "/match/offer": (input, data) => ({ ...data, offers: { draw: input.side } }),
});

const loaded = async () => {
  await paladin.bundler(STORE).bundle({ mime: mime.tty.solid, entry: ENTRY });
  const files = [];
  for await (const entry of Deno.readDir(`${STORE}/bundle`)) files.push(entry.name);
  const code = await Deno.readTextFile(`${STORE}/bundle/${files.find((name) => name.endsWith(".mjs"))}`);
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  const module = await import(url);
  URL.revokeObjectURL(url);
  return module;
};

const module = await loaded();

const stubbed = (data, seeded) => {
  const calls = [];
  const routes = door(calls, seeded);
  const buffer = { id: "B1", $data: atom(data), thread: { id: "T1" } };
  Object.defineProperty(buffer, "data", { get: () => buffer.$data.get(), set: (value) => buffer.$data.set(value) });
  buffer.mode = { connection: { call: (path, input) => (calls.push([path, input]), Promise.resolve(routes[path](input, buffer.data))) } };
  return { buffer, calls };
};

const UNMEASURED = { scale: null, cell: null };

const mounted = async ({ width, height, data = {}, seeded = match, capabilities = null, resolution = true, palette = PALETTE, display = UNMEASURED }) => {
  const { buffer, calls } = stubbed(data, seeded);
  const setup = await testRender(() => [], { width, height });
  if (capabilities !== null) setRendererCapabilities(setup.renderer, capabilities);
  if (resolution) setup.renderer._resolution = { width: width * CELL.width, height: height * CELL.height };
  const frame = new BoxRenderable(setup.renderer, { flexDirection: "column", flexGrow: 1 });
  frame.add(new TextRenderable(setup.renderer, { content: " 1 play", height: 1 }));
  frame.add(new TextRenderable(setup.renderer, { content: "◆ artifact · board/play", height: 1 }));
  frame.add(new TextRenderable(setup.renderer, { content: "─".repeat(width), wrapMode: "none", height: 1 }));
  const element = new BoxRenderable(setup.renderer, { flexDirection: "column", flexGrow: 1, minHeight: 0, overflow: "hidden" });
  frame.add(element);
  frame.add(new TextRenderable(setup.renderer, { content: "MODELINE · ok", height: 1 }));
  setup.renderer.root.add(frame);
  const handle = module.default(element, { terminal: {}, buffer, renderer: setup.renderer, palette, focused: () => false, display });
  await settle(setup);
  const close = () => {
    handle.destroy();
    setup.renderer.destroy();
  };
  return { setup, buffer, calls, element, close };
};

const find = (node, id) => (node.id === id ? node : node.getChildren().map((child) => find(child, id)).find((hit) => hit !== undefined));
const all = (node, test) => [...(test(node) ? [node] : []), ...node.getChildren().flatMap((child) => all(child, test))];
const rows = (frame) => frame.split("\n").map((row) => [...row]);

const square = (setup, at, orientation = "white") => {
  const grid = find(setup.renderer.root, "board");
  const columns = (grid.width - GUTTER.right) / 8;
  const height = grid.height / 8;
  const file = "abcdefgh".indexOf(at[0]);
  const rank = Number(at[1]);
  const column = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 8 - rank : rank - 1;
  return { x: grid.x + column * columns, y: grid.y + row * height, width: columns, height };
};
const centre = (cell) => ({ x: cell.x + Math.floor(cell.width / 2), y: cell.y + Math.floor(cell.height / 2) });
const region = (setup, cell) =>
  rows(setup.captureCharFrame()).slice(cell.y, cell.y + cell.height).map((row) => row.slice(cell.x, cell.x + cell.width).join("")).join("\n");

const background = (setup, { x, y }) => {
  let column = 0;
  for (const span of setup.captureSpans().lines[y].spans) {
    if (x < column + span.width) return span.bg;
    column += span.width;
  }
};
const tinted = (setup, at, token, palette = PALETTE) => background(setup, { x: square(setup, at).x + 1, y: square(setup, at).y }).equals(RGBA.fromHex(palette[token]));
const button = (setup, name) => find(setup.renderer.root, `button-${name}`);
const press = async (setup, name) => {
  const held = button(setup, name);
  await setup.mockMouse.click(held.x + 1, held.y);
  await settle(setup);
};
const paths = (calls) => calls.map(([path]) => path);
const BLOCKS = new Set(SEXTANTS.filter((char) => char !== " "));

describe("play view — the pure parts", () => {
  it("T-adequate: sixel only with evidence — kitty measured off the grid on this terminal (iTerm2) AND a reported device scale; otherwise kitty where it draws, glyphs on sixel-only terminals; a multiplexer, no pixel size, no graphics paint glyphs", () => {
    const sensed = (capabilities, resolution = { width: 700, height: 900 }, display = UNMEASURED) => ({ capabilities, resolution, width: 100, height: 45, display });
    const caps = (extra) => ({ kitty_graphics: false, sixel: false, multiplexer: "none", terminal: { name: "", version: "", from_xtversion: false }, ...extra });
    const iterm = caps({ kitty_graphics: true, sixel: true, terminal: { name: "iTerm2", version: "3.6.9", from_xtversion: true } });
    expect(adequate(sensed(null))).toBe("glyph");
    expect(adequate(sensed(caps({ kitty_graphics: true, multiplexer: "tmux" })))).toBe("glyph");
    expect(adequate(sensed(caps({ kitty_graphics: true }), null))).toBe("glyph");
    expect(adequate(sensed(iterm))).toBe("image");
    expect(protocol(sensed(iterm))).toBe("kitty");
    expect(protocol(sensed(iterm, { width: 700, height: 900 }, { scale: 2, cell: null }))).toBe("sixel");
    expect(adequate(sensed(iterm, { width: 700, height: 900 }, { scale: 2, cell: null }))).toBe("image");
    expect(protocol(sensed(caps({ kitty_graphics: true, sixel: true, terminal: { name: "kitty", version: "0.40", from_xtversion: true } }), { width: 700, height: 900 }, { scale: 2, cell: null }))).toBe("kitty");
    expect(protocol(sensed(caps({ kitty_graphics: true, terminal: { name: "iTerm2", version: "3.6.9", from_xtversion: true } }), { width: 700, height: 900 }, { scale: 2, cell: null }))).toBe("kitty");
    expect(protocol(sensed(caps({ sixel: true })))).toBe("blocks");
    expect(adequate(sensed(caps({ kitty_graphics: true, terminal: { name: "kitty", version: "0.40", from_xtversion: true } })))).toBe("image");
    expect(protocol(sensed(caps({ kitty_graphics: true, sixel: true, terminal: { name: "kitty", version: "0.40", from_xtversion: true } })))).toBe("kitty");
    expect(adequate(sensed(caps({ sixel: true })))).toBe("glyph");
    expect(adequate(sensed(caps({})))).toBe("glyph");
    expect([rendered({}, sensed(iterm)), rendered({ render: "auto" }, sensed(iterm)), rendered({ render: "image" }, sensed(caps({}))), rendered({ render: "glyph" }, sensed(iterm))]).toEqual(["image", "image", "image", "glyph"]);
  });

  it("T-arrangements: the biggest board that fits, its panel beside, below or a strip — squares as square as the cell aspect allows", () => {
    expect(fit({ width: 90, height: 41 }, 20 / 7)).toEqual({ rows: 3, columns: 9, panel: "below" });
    expect(fit({ width: 91, height: 41 }, 20 / 7)).toEqual({ rows: 4, columns: 11, panel: "below" });
    expect(fit({ width: 120, height: 41 }, 20 / 7)).toEqual({ rows: 4, columns: 11, panel: "below" });
    expect(fit({ width: 123, height: 41 }, 20 / 7)).toEqual({ rows: 4, columns: 11, panel: "beside" });
    expect(fit({ width: 214, height: 43 }, 20 / 7)).toEqual({ rows: 5, columns: 14, panel: "beside" });
    expect(fit({ width: 115, height: 43 }, 20 / 7)).toEqual({ rows: 5, columns: 14, panel: "alone" });
    expect(fit({ width: 90, height: 41 }, 2)).toEqual({ rows: 4, columns: 8, panel: "below" });
    expect(fit({ width: 0, height: 0 }, 2)).toEqual({ rows: 1, columns: 2, panel: "alone" });
  });

  it("T-tones: square tones are chosen by contrast against both inks, in every theme; inks sort by light", () => {
    for (const palette of [PALETTE, NORTHSEA]) {
      const pair = grounds(palette);
      expect(pair.light).not.toBe(pair.dark);
      expect([inks(palette).white, inks(palette).black].sort()).toEqual(["surfaceLift", "textStrong"]);
    }
    expect(grounds(PALETTE)).toEqual({ light: "boundaryStrong", dark: "textMuted" });
  });

  it("T-raster: a sprite is the hand-drawn form for the largest authored grid that fits, blitted in sextants, centred and standing on the floor; below 5×2 one solid glyph", () => {
    for (const [columns, rows, key] of [[5, 2, "10x6"], [6, 2, "12x6"], [8, 3, "16x9"], [11, 4, "22x12"], [7, 2, "12x6"], [14, 5, "22x12"]]) {
      expect(AUTHORED.find((entry) => entry.width <= 2 * columns && entry.height <= 3 * rows).key, `${columns}x${rows}`).toBe(key);
      for (const role of ["k", "q", "r", "b", "n", "p"]) {
        const held = sprite(role, columns, rows);
        expect(held.cells.length).toBe(columns * rows);
        expect(held.cells.every((cell) => SEXTANTS.includes(cell.char))).toBe(true);
      }
    }
    const king = sprite("k", 5, 2).cells.map((cell) => SEXTANTS.indexOf(cell.char));
    const bits = (column, row) => king[row * 5 + column];
    const lit = (x, y) => (bits(Math.floor(x / 2), Math.floor(y / 3)) >> ((y % 3) * 2 + (x % 2))) & 1;
    const drawn = FORMS["10x6"].k.map((pixels, y) => [...pixels].map((pixel, x) => Number(pixel === "#") === lit(x, y)).every(Boolean));
    expect(drawn).toEqual([true, true, true, true, true, true]);
    expect(sprite("q", 4, 2).cells.map((cell) => cell.char).join("")).toBe("      ♛ ");
    expect(sprite("p", 3, 1).cells.map((cell) => cell.char).join("")).toBe(" ♟ ");
  });
});

describe("play view — the scaled image, the one library exception", { sanitizeResources: false, sanitizeOps: false }, () => {
  it("T-scaled: ScaledImage overrides ImageRenderable.renderSelf and reads OpenTUI's PRIVATE _image · _screenX · _screenY — a 5×2-cell sixel rasters 70×76 at a 14×38 device cell, 35×38 at 7×19, and OpenTUI's own 35×38 from 14t points with no cell", async () => {
    for (const [cell, raster] of [[{ width: 14, height: 38 }, "1;1;70;76"], [{ width: 7, height: 19 }, "1;1;35;38"], [null, "1;1;35;38"]]) {
      let written = "";
      const stdout = new Writable({ write(chunk, _encoding, callback) { written += Buffer.from(chunk).toString("latin1"); callback(); } });
      Object.assign(stdout, { isTTY: true, columns: 40, rows: 10, getColorDepth: () => 24 });
      const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => {} });
      const renderer = await createCliRenderer({ stdin, stdout, width: 40, height: 10, useAlternateScreen: false, exitOnCtrlC: false, useMouse: false, testing: true });
      setRendererCapabilities(renderer, { kitty_graphics: false, sixel: true, terminal: { name: "iTerm2", version: "3.6.9", from_xtversion: true } });
      renderer._resolution = { width: 40 * 7, height: 10 * 19 };
      const image = new ScaledImage(renderer, { source: NativeImage.fromRgba(new Uint8Array(70 * 76 * 4).fill(200), 70, 76), position: "absolute", left: 2, top: 1, width: 5, height: 2, protocol: "sixel", fit: "fill" });
      image.cell = cell;
      renderer.root.add(image);
      for (let pass = 0; pass < 6; pass++) {
        renderer.requestRender();
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      renderer.destroy();
      expect([...written.matchAll(/\x1bP[0-9;]*q"([0-9;]+)/g)].map((found) => found[1]), `cell ${JSON.stringify(cell)}`).toEqual([raster]);
    }
  });
});

describe("play view — the square image", () => {
  it("T-tile: a square image is its tone with the mark baked in — a dot in the middle of a target, corners on a capture — the piece over it bottom-aligned with the opposite ink as rim", () => {
    const hex = { ground: "#5F7286", accent: "#3D528C", surface: "#EDF0F4", body: "#FFFFFF", rim: "#0E1A25" };
    const pixel = (image, x, y) => "#" + [...image.raw("rgba8").data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
    const size = { width: 77, height: 80 };
    const dot = painted({ role: null, ground: hex.ground, accent: hex.accent, mark: "dot", size });
    expect([pixel(dot, 38, 40), pixel(dot, 0, 0), pixel(dot, 76, 40)]).toEqual([hex.accent, hex.ground, hex.ground]);
    const corners = painted({ role: null, ground: hex.ground, accent: hex.accent, mark: "corners", size });
    expect([pixel(corners, 0, 0), pixel(corners, 76, 79), pixel(corners, 38, 40)]).toEqual([hex.accent, hex.accent, hex.ground]);
    const pawn = painted({ role: "p", body: hex.body, rim: hex.rim, ground: hex.ground, accent: hex.accent, mark: "none", size });
    const column = [...Array(80).keys()].map((y) => pixel(pawn, 38, y));
    expect(column.includes(hex.body)).toBe(true);
    expect(column.includes(hex.rim)).toBe(true);
    expect([column[0], column[79]]).toEqual([hex.ground, hex.ground]);
    expect(column.lastIndexOf(hex.rim)).toBeGreaterThan(70);
    dot.dispose();
    corners.dispose();
    pawn.dispose();
  });
});

describe("play view — mounted in a tty", { sanitizeResources: false, sanitizeOps: false }, () => {
  it("T-render: an empty buffer opens a blitz match; at 91×45 the board is 8 squares of 11×4 cells, every square a kitty image on iTerm2, coordinates in the gutter, both seats, clocks and the buttons print", async () => {
    const { setup, calls, close } = await mounted({ width: 91, height: 45, capabilities: ITERM });
    expect(paths(calls)).toEqual(["/match/create"]);
    expect(calls[0][1]).toEqual({ buffer: "B1", seats: SEATS, clock: { initial: 180, increment: 2 }, rewindable: false, thread: "T1" });
    const grid = find(setup.renderer.root, "board");
    expect({ width: grid.width, height: grid.height }).toEqual({ width: 88 + GUTTER.right, height: 32 });
    const frame = setup.captureCharFrame();
    expect(frame).toContain("○ stockfish · 1600 elo");
    expect(frame).toContain("● you");
    expect(frame).toContain(" 3:00 ");
    expect(frame).toContain("your move · click or drag");
    for (const name of ["new", "resign", "draw", "flip", "opponent", "level", "render"]) expect(button(setup, name) === undefined, name).toBe(false);
    expect(button(setup, "start")).toBe(undefined);
    const images = all(setup.renderer.root, (node) => node instanceof ImageRenderable);
    expect(images.length).toBe(64);
    expect(images.every((image) => image.effectiveProtocol === "kitty")).toBe(true);
    expect([...region(setup, square(setup, "e1"))].some((char) => BLOCKS.has(char))).toBe(false);
    const grid8 = rows(frame);
    expect(grid8[grid.y + 2][grid.x - 2]).toBe("8");
    expect(grid8[grid.y + 7 * 4 + 2][grid.x - 2]).toBe("1");
    expect(grid8[grid.y + 32].slice(grid.x, grid.x + 88).join("").trim().split(/\s+/)).toEqual([..."abcdefgh"]);
    expect([...region(setup, square(setup, "a8"))].includes("8")).toBe(false);
    expect(rows(frame)[44].join("")).toContain("MODELINE · ok");
    close();
  });

  it("T-start: a pending match with the engine to move waits for ▶ start; the button steps the engine", async () => {
    const { setup, calls, close } = await mounted({ width: 91, height: 45, data: engineWhite });
    expect(calls).toEqual([]);
    expect(setup.captureCharFrame()).toContain("stockfish has white — press ▶ start");
    await press(setup, "start");
    expect(paths(calls)).toEqual(["/match/step"]);
    close();
  });

  it("T-click: a click selects a piece — its square lights, dots on its targets; a click on a target moves; a click elsewhere drops it", async () => {
    const { setup, calls, close } = await mounted({ width: 91, height: 45, data: { ...match, status: "playing" } });
    await setup.mockMouse.click(centre(square(setup, "e2")).x, centre(square(setup, "e2")).y);
    await settle(setup);
    expect(tinted(setup, "e2", "signalPrimary")).toBe(true);
    expect(region(setup, square(setup, "e3"))).toContain("●");
    expect(region(setup, square(setup, "e4"))).toContain("●");
    await setup.mockMouse.click(centre(square(setup, "a5")).x, centre(square(setup, "a5")).y);
    await settle(setup);
    expect(region(setup, square(setup, "e4"))).not.toContain("●");
    expect(calls).toEqual([]);
    await setup.mockMouse.click(centre(square(setup, "e2")).x, centre(square(setup, "e2")).y);
    await settle(setup);
    await setup.mockMouse.click(centre(square(setup, "e4")).x, centre(square(setup, "e4")).y);
    await settle(setup);
    expect(calls[0]).toEqual(["/match/move", { buffer: "B1", uci: "e2e4" }]);
    close();
  });

  it("T-drag: the lifted piece rides the square under the pointer; dropped on a legal square it moves, dropped elsewhere it goes back", async () => {
    const { setup, calls, close } = await mounted({ width: 91, height: 45, data: { ...match, status: "playing" } });
    const e2 = centre(square(setup, "e2"));
    const e4 = centre(square(setup, "e4"));
    const e5 = centre(square(setup, "e5"));
    await setup.mockMouse.drag(e2.x, e2.y, e5.x, e5.y);
    await settle(setup);
    expect(calls).toEqual([]);
    expect([...region(setup, square(setup, "e2"))].some((char) => BLOCKS.has(char))).toBe(true);
    await setup.mockMouse.pressDown(e2.x, e2.y);
    await setup.mockMouse.emitMouseEvent("drag", e4.x + 1, e4.y);
    await settle(setup);
    expect(tinted(setup, "e4", "signalPrimary")).toBe(true);
    expect([...region(setup, square(setup, "e4"))].some((char) => BLOCKS.has(char))).toBe(true);
    expect([...region(setup, square(setup, "e2"))].some((char) => BLOCKS.has(char))).toBe(false);
    await setup.mockMouse.release(e4.x, e4.y);
    await settle(setup);
    expect(calls[0]).toEqual(["/match/move", { buffer: "B1", uci: "e2e4" }]);
    close();
  });

  it("T-promote: a pawn dropped on the last rank offers queen, rook, bishop, knight down its file; a click on the queen plays a7a8q", async () => {
    const { setup, calls, close } = await mounted({ width: 91, height: 45, data: promoting });
    await setup.mockMouse.drag(centre(square(setup, "a7")).x, centre(square(setup, "a7")).y, centre(square(setup, "a8")).x, centre(square(setup, "a8")).y);
    await settle(setup);
    expect(calls).toEqual([]);
    expect(setup.captureCharFrame()).toContain("promote — click a piece on the board or below");
    for (const role of ["q", "r", "b", "n"]) expect(button(setup, `promote-${role}`) === undefined).toBe(false);
    for (const at of ["a8", "a7", "a6", "a5"]) expect([...region(setup, square(setup, at))].some((char) => BLOCKS.has(char)), at).toBe(true);
    await setup.mockMouse.click(centre(square(setup, "a8")).x, centre(square(setup, "a8")).y);
    await settle(setup);
    expect(calls[0]).toEqual(["/match/move", { buffer: "B1", uci: "a7a8q" }]);
    close();
  });

  it("T-buttons: flip writes orientation through /match/view and the board turns; pieces cycles auto → image → glyph; opponent and level re-seat the other side", async () => {
    const { setup, buffer, calls, close } = await mounted({ width: 91, height: 45, data: { ...match } });
    expect(square(setup, "a1").y).toBeGreaterThan(square(setup, "a8").y);
    await press(setup, "flip");
    expect(calls.at(-1)).toEqual(["/match/view", { buffer: "B1", orientation: "black" }]);
    expect(buffer.data.orientation).toBe("black");
    expect(setup.captureCharFrame()).toContain(" h ");
    await press(setup, "render");
    expect(calls.at(-1)).toEqual(["/match/view", { buffer: "B1", render: "image" }]);
    await press(setup, "render");
    expect(calls.at(-1)).toEqual(["/match/view", { buffer: "B1", render: "glyph" }]);
    await press(setup, "render");
    expect(calls.at(-1)).toEqual(["/match/view", { buffer: "B1", render: "auto" }]);
    await press(setup, "level");
    expect(calls.at(-1)).toEqual(["/match/seat", { buffer: "B1", side: "black", occupant: { kind: "engine", elo: 2000, movetime: 600 } }]);
    await press(setup, "opponent");
    expect(calls.at(-1)).toEqual(["/match/seat", { buffer: "B1", side: "black", occupant: { kind: "hallucinator", assisted: true } }]);
    close();
  });

  it("T-orientation: data.orientation draws the board from that side, whoever sits where", async () => {
    const { setup, close } = await mounted({ width: 91, height: 45, data: { ...match, orientation: "black" } });
    const grid = find(setup.renderer.root, "board");
    expect(square(setup, "h1", "black")).toEqual({ x: grid.x, y: grid.y, width: 11, height: 4 });
    close();
  });

  it("T-ended: the mated king's square glows, the result reads, the game buttons fold to new · flip · pieces", async () => {
    const { setup, close } = await mounted({ width: 91, height: 45, data: mated });
    expect(tinted(setup, "e1", "signalNegative")).toBe(true);
    expect(setup.captureCharFrame()).toContain("0-1 · checkmate");
    expect(["resign", "draw", "opponent", "level"].map((name) => button(setup, name))).toEqual([undefined, undefined, undefined, undefined]);
    expect(["new", "flip", "render"].every((name) => button(setup, name) !== undefined)).toBe(true);
    close();
  });

  const SIZES = [
    [90, 45, { columns: 9, rows: 3 }],
    [91, 45, { columns: 11, rows: 4 }],
    [120, 45, { columns: 11, rows: 4 }],
    [214, 47, { columns: 14, rows: 5 }],
    [60, 20, { columns: 3, rows: 1 }],
  ];
  for (const [width, height, expected] of SIZES) {
    it(`T-fit ${width}×${height}: ${expected.columns}×${expected.rows}-cell squares; nothing leaves the element, the head and modeline survive`, async () => {
      const { setup, element, close } = await mounted({ width, height, data: afterE5 });
      const grid = rows(setup.captureCharFrame());
      expect(grid[1].join("")).toContain("◆ artifact · board/play");
      expect(grid[height - 1].join("")).toContain("MODELINE · ok");
      const board = find(setup.renderer.root, "board");
      expect({ columns: (board.width - GUTTER.right) / 8, rows: board.height / 8 }).toEqual(expected);
      const inside = (node) => node.x >= element.x && node.y >= element.y && node.x + node.width <= element.x + element.width && node.y + node.height <= element.y + element.height;
      expect(all(element, (node) => node !== element && node.width > 0 && !inside(node)).map((node) => `${node.id} ${node.x},${node.y} ${node.width}×${node.height}`)).toEqual([]);
      close();
    });
  }

  it("T-aspect: a pixel resolution that lands after mount, with no event, re-sizes the squares to the true cell aspect", async () => {
    const { setup, close } = await mounted({ width: 91, height: 45, data: afterE5, resolution: false });
    expect((find(setup.renderer.root, "board").width - GUTTER.right) / 8).toBe(8);
    setup.renderer._resolution = { width: 91 * CELL.width, height: 45 * CELL.height };
    await settle(setup);
    expect((find(setup.renderer.root, "board").width - GUTTER.right) / 8).toBe(11);
    close();
  });

  for (const [theme, palette] of [["porcelain", PALETTE], ["northsea", NORTHSEA]]) {
    it(`T-image ${theme}: where images are adequate every square is one opaque image of exactly its cells on its own tone, pieces and marks baked in; the column right of the board is plain surface cells; render glyph turns them off`, async () => {
      const { setup, buffer, close } = await mounted({ width: 91, height: 45, data: afterE5, capabilities: KITTY, palette });
      const images = all(setup.renderer.root, (node) => node instanceof ImageRenderable);
      expect(images.length).toBe(64);
      const pair = grounds(palette);
      const token = (name) => RGBA.fromHex(palette[name]).toInts().slice(0, 3);
      for (const image of images) {
        const at = image.id.replace("square-", "");
        expect({ x: image.x, y: image.y, width: image.width, height: image.height }, at).toEqual(square(setup, at));
        expect(image.effectiveProtocol).toBe("kitty");
        const raw = image.image.raw("rgba8");
        expect({ width: raw.width, height: raw.height }).toEqual({ width: 11 * CELL.width, height: 4 * CELL.height });
        expect(raw.data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
      }
      const grid = find(setup.renderer.root, "board");
      for (let row = 0; row < grid.height; row++) expect(background(setup, { x: grid.x + grid.width - GUTTER.right, y: grid.y + row }).equals(RGBA.fromHex(palette.surface)), `right gutter ${row}`).toBe(true);
      const corner = (at) => [...find(setup.renderer.root, `square-${at}`).image.raw("rgba8").data.slice(0, 3)];
      expect(corner("a1")).toEqual(token(pair.dark));
      expect(corner("h1")).toEqual(token(pair.light));
      expect(corner("e5")).toEqual(token("signalPrimaryTint"));
      expect(corner("a4")).toEqual(token(pair.light));
      buffer.data = { ...buffer.data, render: "glyph" };
      await settle(setup);
      expect(all(setup.renderer.root, (node) => node instanceof ImageRenderable)).toEqual([]);
      close();
    });
  }

  it("T-kitty: a real renderer on a kitty terminal transmits each square as opaque RGB (f=24) and places it uncropped in its own 11×4 cells, every placement its own id", async () => {
    const { buffer } = stubbed(afterE5, match);
    const chunks = [];
    const stdout = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    Object.assign(stdout, { isTTY: true, columns: 91, rows: 45, getColorDepth: () => 24 });
    const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => {} });
    const renderer = await createCliRenderer({ stdin, stdout, width: 91, height: 45, useAlternateScreen: false, exitOnCtrlC: false, useMouse: false, testing: true });
    setRendererCapabilities(renderer, KITTY);
    renderer._resolution = { width: 91 * CELL.width, height: 45 * CELL.height };
    const handle = module.default(renderer.root, { terminal: {}, buffer, renderer, palette: PALETTE, focused: () => false, display: UNMEASURED });
    for (let pass = 0; pass < 8; pass++) {
      renderer.requestRender();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    const commands = [...Buffer.concat(chunks).toString("latin1").matchAll(/\x1b_G([^;\x1b]*)/g)].map((found) => Object.fromEntries(found[1].split(",").map((pair) => pair.split("="))));
    handle.destroy();
    renderer.destroy();
    const transmitted = commands.filter((command) => command.a === "t");
    const placed = commands.filter((command) => command.a === "p");
    expect(transmitted.length).toBeGreaterThan(0);
    expect(transmitted.every((command) => command.f === "24")).toBe(true);
    expect(placed.length).toBeGreaterThanOrEqual(64);
    expect(placed.every((command) => command.c === "11" && command.r === "4")).toBe(true);
    const firsts = placed.slice(0, 64);
    expect(new Set(firsts.map((command) => command.p)).size).toBe(64);
    expect(firsts.every((command) => Number(command.p) < 2 ** 31)).toBe(true);
  });

  it("T-sixel: a real renderer on a sixel-only terminal sends no sixel and no kitty graphics — the board paints hand-drawn glyphs", async () => {
    const { buffer } = stubbed(afterE5, match);
    const chunks = [];
    const stdout = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    Object.assign(stdout, { isTTY: true, columns: 91, rows: 45, getColorDepth: () => 24 });
    const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => {} });
    const renderer = await createCliRenderer({ stdin, stdout, width: 91, height: 45, useAlternateScreen: false, exitOnCtrlC: false, useMouse: false, testing: true });
    setRendererCapabilities(renderer, { sixel: true, kitty_graphics: false, terminal: { name: "foot", version: "1.20", from_xtversion: true } });
    renderer._resolution = { width: 91 * CELL.width, height: 45 * CELL.height };
    const handle = module.default(renderer.root, { terminal: {}, buffer, renderer, palette: PALETTE, focused: () => false, display: UNMEASURED });
    for (let pass = 0; pass < 8; pass++) {
      renderer.requestRender();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    const written = Buffer.concat(chunks).toString("latin1");
    handle.destroy();
    renderer.destroy();
    expect([...written.matchAll(/\x1bP[0-9;]*q/g)]).toEqual([]);
    expect([...written.matchAll(/\x1b_Ga=[tTp]/g)]).toEqual([]);
  });

  const rendered = async (capabilities, display, width, height) => {
    const { buffer } = stubbed(afterE5, match);
    const chunks = [];
    const stdout = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    Object.assign(stdout, { isTTY: true, columns: width, rows: height, getColorDepth: () => 24 });
    const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => {} });
    const renderer = await createCliRenderer({ stdin, stdout, width, height, useAlternateScreen: false, exitOnCtrlC: false, useMouse: false, testing: true });
    setRendererCapabilities(renderer, capabilities);
    renderer._resolution = { width: width * CELL.width, height: height * CELL.height };
    const handle = module.default(renderer.root, { terminal: {}, buffer, renderer, palette: PALETTE, focused: () => false, display });
    for (let pass = 0; pass < 8; pass++) {
      renderer.requestRender();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    const grid = find(renderer.root, "board");
    const shape = { columns: (grid.width - GUTTER.right) / 8, rows: grid.height / 8 };
    handle.destroy();
    renderer.destroy();
    return { written: Buffer.concat(chunks).toString("latin1"), shape };
  };

  for (const [width, height] of [[91, 45], [62, 22]]) {
    it(`T-sixel-iterm ${width}×${height}: iTerm2 with a reported device cell draws every square as a sixel at that cell's pixels, and sends no kitty`, async () => {
      const { written, shape } = await rendered(ITERM, { scale: 2, cell: { width: 14, height: 38 } }, width, height);
      const rasters = [...written.matchAll(/\x1bP[0-9;]*q"1;1;(\d+);(\d+)/g)].map((found) => `${found[1]}x${found[2]}`);
      expect(rasters.length).toBeGreaterThanOrEqual(64);
      expect([...new Set(rasters)]).toEqual([`${shape.columns * 14}x${shape.rows * 38}`]);
      expect([...written.matchAll(/\x1b_Ga=[tTp]/g)]).toEqual([]);
    });

    it(`T-sixel-scale ${width}×${height}: a reported scale without a cell multiplies OpenTUI's 14t cell`, async () => {
      const { written, shape } = await rendered(ITERM, { scale: 2, cell: null }, width, height);
      const rasters = [...written.matchAll(/\x1bP[0-9;]*q"1;1;(\d+);(\d+)/g)].map((found) => `${found[1]}x${found[2]}`);
      expect([...new Set(rasters)]).toEqual([`${shape.columns * CELL.width * 2}x${shape.rows * CELL.height * 2}`]);
    });
  }

  it("T-sixel-unmeasured: iTerm2 with no reported scale keeps kitty — sixel needs both pieces of evidence", async () => {
    const { written } = await rendered(ITERM, UNMEASURED, 91, 45);
    expect([...written.matchAll(/\x1bP[0-9;]*q/g)]).toEqual([]);
    expect([...written.matchAll(/\x1b_Ga=p/g)].length).toBeGreaterThanOrEqual(64);
  });
});

Deno.test({ name: "play view — the bundle store is removed", sanitizeResources: false, sanitizeOps: false, fn: () => Deno.remove(STORE, { recursive: true }) });
