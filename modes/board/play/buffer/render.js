import { resolveImageRenderProtocol } from "@opentui/core";

export const OFFGRID = { kitty: ["iTerm2", "iTerm.app"] };

const offgrid = (sensed, protocol) => OFFGRID[protocol].includes(sensed.capabilities.terminal.name);

export const PROTOCOLS = [
  [(sensed) => sensed.capabilities === null, "auto"],
  [(sensed) => sensed.display.scale !== null && sensed.capabilities.sixel && offgrid(sensed, "kitty"), "sixel"],
  [(sensed) => sensed.capabilities.kitty_graphics, "kitty"],
  [() => true, "none"],
];

export const placing = (sensed) => PROTOCOLS.find(([test]) => test(sensed))[1];

export const ADEQUATE = [
  [(sensed) => sensed.capabilities === null, "glyph"],
  [(sensed) => sensed.capabilities.multiplexer === "tmux", "glyph"],
  [(sensed) => sensed.resolution === null, "glyph"],
  [(sensed) => placing(sensed) !== "none", "image"],
  [() => true, "glyph"],
];

export const adequate = (sensed) => ADEQUATE.find(([test]) => test(sensed))[1];

export const RENDERS = [
  [(data) => data.render === "image", () => "image"],
  [(data) => data.render === "glyph", () => "glyph"],
  [() => true, (data, sensed) => adequate(sensed)],
];

export const rendered = (data, sensed) => RENDERS.find(([test]) => test(data))[1](data, sensed);

const REQUESTED = { auto: "auto", sixel: "sixel", kitty: "kitty", none: "blocks" };

export const protocol = (sensed) => resolveImageRenderProtocol(REQUESTED[placing(sensed)], sensed.capabilities, sensed.resolution !== null);

export const UNSENSED = { width: 8, height: 16 };

const CELLS = [
  [(sensed) => sensed.resolution === null, () => UNSENSED],
  [(sensed) => sensed.width <= 0 || sensed.height <= 0, () => UNSENSED],
  [() => true, (sensed) => ({ width: sensed.resolution.width / sensed.width, height: sensed.resolution.height / sensed.height })],
];

export const cell = (sensed) => CELLS.find(([test]) => test(sensed))[1](sensed);

export const aspect = (sensed) => cell(sensed).height / cell(sensed).width;

const DEVICE = [
  [(sensed) => placing(sensed) !== "sixel", () => null],
  [(sensed) => sensed.display.cell !== null, (sensed) => sensed.display.cell],
  [() => true, (sensed) => ({ width: cell(sensed).width * sensed.display.scale, height: cell(sensed).height * sensed.display.scale })],
];

export const device = (sensed) => DEVICE.find(([test]) => test(sensed))[1](sensed);

const PIXELS = [
  [(sensed) => device(sensed) === null, cell],
  [() => true, device],
];

export const pixels = (sensed) => PIXELS.find(([test]) => test(sensed))[1](sensed);

export const sense = (renderer, display) => ({
  capabilities: renderer.capabilities,
  resolution: renderer.resolution,
  width: renderer.terminalWidth,
  height: renderer.terminalHeight,
  display,
});

export const same = (one, other) =>
  one.capabilities === other.capabilities && one.resolution === other.resolution && one.width === other.width && one.height === other.height;

export const PANEL = { beside: 30, below: 8 };

export const GUTTER = { left: 2, right: 1, below: 1 };

export const ARRANGEMENTS = [
  ["beside", (columns, rows, frame) => GUTTER.left + 8 * columns + GUTTER.right + 2 + PANEL.beside <= frame.width && 8 * rows + GUTTER.below <= frame.height],
  ["below", (columns, rows, frame) => GUTTER.left + 8 * columns + GUTTER.right <= frame.width && 8 * rows + GUTTER.below + PANEL.below <= frame.height],
  ["alone", (columns, rows, frame) => GUTTER.left + 8 * columns + GUTTER.right <= frame.width && 8 * rows + GUTTER.below + 2 <= frame.height],
];

export const fit = (frame, ratio) => {
  for (let rows = Math.floor(frame.height / 8); rows >= 1; rows--) {
    const columns = Math.max(2, Math.round(rows * ratio));
    const found = ARRANGEMENTS.find(([, fits]) => fits(columns, rows, frame));
    if (found !== undefined) return { rows, columns, panel: found[0] };
  }
  return { rows: 1, columns: 2, panel: "alone" };
};
