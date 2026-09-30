import { RGBA } from "@opentui/core";

export const INK_TOKENS = ["surfaceLift", "textStrong"];
export const GROUND_TOKENS = ["surfaceSunk", "boundary", "boundaryStrong", "divider", "textMuted", "textLight", "textInk"];
export const CHECKERED = 1.7;

const linear = (channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

export const luminance = (hex) => {
  const [red, green, blue] = RGBA.fromHex(hex).toInts();
  return 0.2126 * linear(red / 255) + 0.7152 * linear(green / 255) + 0.0722 * linear(blue / 255);
};

export const contrast = (one, other) => (Math.max(luminance(one), luminance(other)) + 0.05) / (Math.min(luminance(one), luminance(other)) + 0.05);

const lighter = (palette) => (one, other) => luminance(palette[other]) - luminance(palette[one]);

export const inks = (palette) => {
  const [light, dark] = [...INK_TOKENS].sort(lighter(palette));
  return { white: light, black: dark };
};

export const grounds = (palette) => {
  const ink = inks(palette);
  const pairs = GROUND_TOKENS.flatMap((light) => GROUND_TOKENS.map((dark) => ({ light, dark })))
    .filter((pair) => luminance(palette[pair.light]) > luminance(palette[pair.dark]) && contrast(palette[pair.light], palette[pair.dark]) >= CHECKERED);
  const legible = (pair) => Math.min(...[pair.light, pair.dark].flatMap((ground) => [ink.white, ink.black].map((side) => contrast(palette[ground], palette[side]))));
  return pairs.reduce((best, pair) => (legible(pair) > legible(best) ? pair : best));
};

export const toned = (palette) => {
  const ground = grounds(palette);
  return [
    [(square) => square.checked, "signalNegative"],
    [(square) => square.hovered, "signalPrimary"],
    [(square) => square.source, "signalPrimary"],
    [(square) => square.capture, "signalCaution"],
    [(square) => square.marked, "signalPrimaryTint"],
    [(square) => square.light, ground.light],
    [() => true, ground.dark],
  ];
};

export const tone = (table, square) => table.find(([test]) => test(square))[1];

export const MARKS = [
  [(square) => square.capture, "corners"],
  [(square) => square.target, "dot"],
  [() => true, "none"],
];

export const mark = (square) => MARKS.find(([test]) => test(square))[1];

export const colours = (palette) => Object.fromEntries(Object.entries(palette).map(([token, hex]) => [token, RGBA.fromHex(hex)]));
