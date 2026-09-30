import { NativeImage, RGBA } from "@opentui/core";
import { PNG } from "./pieces/index.js";

export const FILL = 0.9;
export const FOOT = 0.05;

const decoded = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const planes = {};

export const plane = (role) => {
  if (Object.hasOwn(planes, role)) return planes[role];
  const image = NativeImage.decode(decoded(PNG[role]));
  const raw = image.raw("rgba8");
  const alpha = new Float32Array(raw.width * raw.height);
  const lit = new Float32Array(raw.width * raw.height);
  for (let y = 0; y < raw.height; y++)
    for (let x = 0; x < raw.width; x++) {
      const from = y * raw.stride + x * 4;
      alpha[y * raw.width + x] = raw.data[from + 3] / 255;
      lit[y * raw.width + x] = (raw.data[from] / 255) * (raw.data[from + 3] / 255);
    }
  image.dispose();
  planes[role] = { width: raw.width, height: raw.height, alpha, lit };
  return planes[role];
};

export const canvas = (columns, rows, cell) => ({ width: Math.max(1, Math.round(columns * cell.width)), height: Math.max(1, Math.round(rows * cell.height)) });

export const placed = (source, size) => {
  const scale = Math.min((FILL * size.height) / source.height, (FILL * size.width) / source.width);
  return { scale, left: (size.width - source.width * scale) / 2, top: size.height * (1 - FOOT) - source.height * scale };
};

const sampled = (source, place, x, y) => {
  const left = Math.max(0, Math.floor((x - place.left) / place.scale));
  const right = Math.min(source.width, Math.ceil((x + 1 - place.left) / place.scale));
  const top = Math.max(0, Math.floor((y - place.top) / place.scale));
  const bottom = Math.min(source.height, Math.ceil((y + 1 - place.top) / place.scale));
  if (right <= left || bottom <= top) return { alpha: 0, light: 0 };
  let alpha = 0;
  let lit = 0;
  for (let row = top; row < bottom; row++)
    for (let column = left; column < right; column++) {
      alpha += source.alpha[row * source.width + column];
      lit += source.lit[row * source.width + column];
    }
  const count = (right - left) * (bottom - top);
  return { alpha: alpha / count, light: alpha > 0 ? lit / alpha : 0 };
};

export const MARKED = [
  ["dot", (place, x, y) => (x - place.centre.x) ** 2 + (y - place.centre.y) ** 2 <= (0.12 * place.side) ** 2],
  ["corners", (place, x, y) => Math.min(x, place.width - 1 - x) + Math.min(y, place.height - 1 - y) < 0.22 * place.side],
  ["none", () => false],
];

const marked = (mark) => MARKED.find(([name]) => name === mark)[1];

export const painted = (tile) => {
  const [ground, accent] = [tile.ground, tile.accent].map((hex) => RGBA.fromHex(hex).toInts());
  const place = { width: tile.size.width, height: tile.size.height, side: Math.min(tile.size.width, tile.size.height), centre: { x: tile.size.width / 2, y: tile.size.height / 2 } };
  const inked = marked(tile.mark);
  const pixels = new Uint8Array(tile.size.width * tile.size.height * 4);
  for (let y = 0; y < tile.size.height; y++)
    for (let x = 0; x < tile.size.width; x++) {
      const to = (y * tile.size.width + x) * 4;
      const under = inked(place, x, y) ? accent : ground;
      pixels.set(under, to);
      pixels[to + 3] = 255;
    }
  if (tile.role === null) return NativeImage.fromRgba(pixels, tile.size.width, tile.size.height);
  const source = plane(tile.role);
  const at = placed(source, tile.size);
  const [fill, edge] = [tile.body, tile.rim].map((hex) => RGBA.fromHex(hex).toInts());
  for (let y = 0; y < tile.size.height; y++)
    for (let x = 0; x < tile.size.width; x++) {
      const to = (y * tile.size.width + x) * 4;
      const { alpha, light } = sampled(source, at, x, y);
      for (let channel = 0; channel < 3; channel++) {
        const piece = edge[channel] + (fill[channel] - edge[channel]) * light;
        pixels[to + channel] = Math.round(pixels[to + channel] + (piece - pixels[to + channel]) * alpha);
      }
    }
  return NativeImage.fromRgba(pixels, tile.size.width, tile.size.height);
};

export const gallery = () => {
  const held = {};
  return {
    get: (key, make) => {
      if (!Object.hasOwn(held, key)) held[key] = make();
      return held[key];
    },
    dispose: () => {
      for (const image of Object.values(held)) image.dispose();
    },
  };
};
