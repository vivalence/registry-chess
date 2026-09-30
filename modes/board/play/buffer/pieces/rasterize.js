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
