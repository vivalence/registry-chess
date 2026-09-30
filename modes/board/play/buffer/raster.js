import { FORMS } from "./pieces/forms.js";
import { GLYPH } from "./board.js";

const SEXTANT = { columns: 2, rows: 3 };

const LONE = [
  [(bits) => bits === 0, () => " "],
  [(bits) => bits === 63, () => "█"],
  [(bits) => bits === 21, () => "▌"],
  [(bits) => bits === 42, () => "▐"],
  [() => true, (bits) => String.fromCodePoint(0x1fb00 + bits - 1 - Number(bits > 21) - Number(bits > 42))],
];

export const sextant = (bits) => LONE.find(([test]) => test(bits))[1](bits);

export const SEXTANTS = Array.from({ length: 64 }, (_, bits) => sextant(bits));

export const AUTHORED = Object.entries(FORMS)
  .map(([key, form]) => ({ key, form, width: form.k[0].length, height: form.k.length }))
  .sort((one, other) => other.width * other.height - one.width * one.height);

export const authored = (columns, rows) => AUTHORED.filter((entry) => entry.width <= columns * SEXTANT.columns && entry.height <= rows * SEXTANT.rows);

const inked = (art, offset, x, y) => {
  const row = y - offset.y;
  const column = x - offset.x;
  if (row < 0 || row >= art.length || column < 0 || column >= art[row].length) return false;
  return art[row][column] === "#";
};

const formed = (role, columns, rows) => {
  const entry = authored(columns, rows)[0];
  const art = entry.form[role];
  const offset = { x: Math.floor((columns * SEXTANT.columns - entry.width) / 2), y: rows * SEXTANT.rows - entry.height };
  const cells = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      let bits = 0;
      for (let y = 0; y < SEXTANT.rows; y++)
        for (let x = 0; x < SEXTANT.columns; x++)
          if (inked(art, offset, column * SEXTANT.columns + x, row * SEXTANT.rows + y)) bits |= 1 << (y * SEXTANT.columns + x);
      cells.push({ char: sextant(bits) });
    }
  return cells;
};

const symbol = (role, columns, rows) => {
  const cells = Array.from({ length: columns * rows }, () => ({ char: " " }));
  cells[Math.floor(rows / 2) * columns + Math.floor(columns / 2)] = { char: GLYPH[role] };
  return cells;
};

export const SPRITES = [
  [(columns, rows) => authored(columns, rows).length > 0, formed],
  [() => true, symbol],
];

const sprites = {};

export const sprite = (role, columns, rows) => {
  const key = `${role}:${columns}x${rows}`;
  if (Object.hasOwn(sprites, key)) return sprites[key];
  sprites[key] = { columns, rows, cells: SPRITES.find(([test]) => test(columns, rows))[1](role, columns, rows) };
  return sprites[key];
};

export const stamp = (buffer, x, y, held, ink, ground) => {
  held.cells.forEach((cell, index) => {
    const column = index % held.columns;
    const row = Math.floor(index / held.columns);
    buffer.setCell(x + column, y + row, cell.char, ink, ground);
  });
};
