import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";

const HEIGHT = 384;
const PROBE = 800;
const ROLES = { k: "wK", q: "wQ", r: "wR", b: "wB", n: "wN", p: "wP" };
const here = new URL(".", import.meta.url);

await initWasm(await fetch(import.meta.resolve("npm:@resvg/resvg-wasm@2.6.2/index_bg.wasm")));

const sources = {};
for (const [role, file] of Object.entries(ROLES)) sources[role] = await Deno.readTextFile(new URL(`chessnut/${file}.svg`, here));

const bounds = (svg) => {
  const image = new Resvg(svg, { fitTo: { mode: "width", value: PROBE } }).render();
  const pixels = image.pixels;
  const box = { left: image.width, top: image.height, right: 0, bottom: 0 };
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if (pixels[(y * image.width + x) * 4 + 3] > 0) Object.assign(box, { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x + 1), bottom: Math.max(box.bottom, y + 1) });
  image.free();
  return box;
};

const boxes = Object.values(sources).map(bounds);
const union = {
  left: Math.min(...boxes.map((box) => box.left)),
  top: Math.min(...boxes.map((box) => box.top)),
  right: Math.max(...boxes.map((box) => box.right)),
  bottom: Math.max(...boxes.map((box) => box.bottom)),
};

const framed = (svg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${union.left} ${union.top} ${union.right - union.left} ${union.bottom - union.top}">` +
  `<image x="0" y="0" width="${PROBE}" height="${PROBE}" href="data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(svg))}"/></svg>`;

const rasterized = {};
for (const [role, svg] of Object.entries(sources)) rasterized[role] = encodeBase64(new Resvg(framed(svg), { fitTo: { mode: "height", value: HEIGHT } }).render().asPng());

const entries = Object.entries(rasterized).map(([role, base64]) => `  ${role}: "${base64}",`).join("\n");
await Deno.writeTextFile(
  new URL("index.js", here),
  `export const SET = { name: "chessnut", author: "Alexis Luengas", licence: "Apache-2.0" };\n\nexport const PNG = {\n${entries}\n};\n`,
);

const KITS = ["board/play", "coach/practice", "library/games", "riddle/puzzles", "study/analysis"];
const SIDES = { white: "w", black: "b" };

const frameOf = (svgs) => {
  const boxes = svgs.map(bounds);
  const box = {
    left: Math.min(...boxes.map((each) => each.left)),
    top: Math.min(...boxes.map((each) => each.top)),
    right: Math.max(...boxes.map((each) => each.right)),
    bottom: Math.max(...boxes.map((each) => each.bottom)),
  };
  const scale = Number(svgs[0].match(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/)[1]) / PROBE;
  const at = (value) => Math.round(value * scale);
  return `${at(box.left)} ${at(box.top)} ${at(box.right - box.left)} ${at(box.bottom - box.top)}`;
};

const inner = (svg) => svg.slice(svg.indexOf(">", svg.indexOf("<svg")) + 1, svg.lastIndexOf("</svg>"));

const inked = (svg) =>
  inner(svg)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+id="[^"]*"/g, "")
    .replaceAll("#FFFFFF", "var(--piece-fill)")
    .replaceAll("#000000", "var(--piece-ink)")
    .replace(/\s+/g, " ")
    .trim();

const TOKENS = {
  white: { "#fff": "var(--piece-fill)", "#bfd3d7": "var(--piece-shade)", "#000": "var(--piece-edge)" },
  black: { "#1c1c2f": "var(--piece-fill)", "#7f899b": "var(--piece-shade)", "#000": "var(--piece-edge)" },
};
const PAINTED = ["fill", "stroke", "stop-color"];

const tokened = (svg, side, prefix) => {
  const rules = {};
  for (const [, block] of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
    for (const [, name, declarations] of block.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) rules[name] = declarations;
  const referenced = new Set([...svg.matchAll(/(?:url\(|href=")#([\w-]+)/g)].map(([, id]) => id));
  const painted = (style) =>
    style
      .replace(/#[0-9a-fA-F]{3,6}\b/g, (hex) => TOKENS[side][hex.toLowerCase()] ?? hex)
      .replace(/url\(#([\w-]+)\)/g, (_, id) => `url(#${prefix}-${id})`);
  const tag = (_, name, attributes, closing) => {
    const kept = [];
    const styles = [];
    for (const [, key, value] of attributes.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      if (key === "class") styles.push(...value.split(/\s+/).filter((name) => rules[name]).map((name) => rules[name]));
      else if (key === "style") styles.push(value);
      else if (PAINTED.includes(key) && value.startsWith("#")) styles.push(`${key}:${value}`);
      else if (key === "id") referenced.has(value) && kept.push(`id="${prefix}-${value}"`);
      else if (key === "xlink:href" || key === "href") kept.push(`href="#${prefix}-${value.slice(1)}"`);
      else kept.push(`${key}="${painted(value)}"`);
    }
    if (styles.length) kept.push(`style="${painted(styles.join(";"))}"`);
    return `<${name}${kept.map((attribute) => ` ${attribute}`).join("")}${closing}>`;
  };
  const markup = inner(svg)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "")
    .replace(/<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g, tag)
    .replace(/\s+/g, " ")
    .trim();
  const left = markup.match(/#[0-9a-fA-F]{3,6}\b/g);
  if (left) throw new Error(`[pieces] ${prefix} keeps colours no token names: ${left.join(" ")}`);
  return `<g style="fill:var(--piece-edge)">${markup}</g>`;
};

const DRAWN = {
  fantasy: { author: "Maurizio Monge", licence: "MIT" },
  spatial: { author: "Maurizio Monge", licence: "MIT" },
  celtic: { author: "Maurizio Monge", licence: "MIT" },
};

const chessnut = Object.fromEntries(Object.entries(sources).map(([role, svg]) => [role, inked(svg)]));
const catalog = {
  chessnut: {
    author: "Alexis Luengas",
    licence: "Apache-2.0",
    frame: `${union.left} ${union.top} ${union.right - union.left} ${union.bottom - union.top}`,
    white: chessnut,
    black: chessnut,
  },
};
for (const [name, credit] of Object.entries(DRAWN)) {
  const files = {};
  for (const [side, letter] of Object.entries(SIDES))
    for (const [role, file] of Object.entries(ROLES))
      files[`${side}.${role}`] = await Deno.readTextFile(new URL(`${name}/${letter}${file.slice(1)}.svg`, here));
  const drawn = (side) =>
    Object.fromEntries(Object.keys(ROLES).map((role) => [role, tokened(files[`${side}.${role}`], side, `${name}-${SIDES[side]}${role}`)]));
  catalog[name] = { ...credit, frame: frameOf(Object.values(files)), white: drawn("white"), black: drawn("black") };
}

const vector = `export const PIECESETS = ${JSON.stringify(catalog, null, 2)};\n`;
for (const kit of KITS) await Deno.writeTextFile(new URL(`../../../../${kit}/buffer/kit/pieces.js`, here), vector);
