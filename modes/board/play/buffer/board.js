export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const FILES = "abcdefgh";
export const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
export const ROLES = ["k", "q", "r", "b", "n", "p"];
export const PROMOTIONS = ["q", "r", "b", "n"];
export const KINDS = ["user", "engine", "hallucinator"];
export const ELOS = [1320, 1600, 2000, 2400, 2800];
export const RENDERED = ["auto", "image", "glyph"];

const VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1 };
const ORDER = ["q", "r", "b", "n", "p"];

export const pieces = (fen) => {
  const board = {};
  fen.split(" ")[0].split("/").forEach((row, index) => {
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) file += Number(char);
      else board[`${FILES[file++]}${8 - index}`] = char;
    }
  });
  return board;
};

export const sideOf = (piece) => (piece === piece.toUpperCase() ? "white" : "black");
export const opponent = (side) => (side === "white" ? "black" : "white");

const SEATED = [
  [(data) => data.seats.white.kind === "user", () => "white"],
  [(data) => data.seats.black.kind === "user", () => "black"],
  [() => true, () => "white"],
];
export const seated = (data) => SEATED.find(([test]) => test(data))[1](data);

const ORIENTED = [
  [(data) => data.orientation === undefined, seated],
  [() => true, (data) => data.orientation],
];
export const oriented = (data) => ORIENTED.find(([test]) => test(data))[1](data);

export const rewound = (data) => data.cursor !== undefined;

const SHOWN = [
  [(data) => data.shown === undefined, (data) => ({ fen: data.fen, turn: data.turn, lastMove: data.moves.length === 0 ? null : data.moves.at(-1) })],
  [(data) => data.shown.lastMove === undefined, (data) => ({ fen: data.shown.fen, turn: data.shown.turn, lastMove: null })],
  [() => true, (data) => ({ fen: data.shown.fen, turn: data.shown.turn, lastMove: data.shown.lastMove })],
];
export const shown = (data) => SHOWN.find(([test]) => test(data))[1](data);

export const ended = (data) => data.status === "ended" && !rewound(data);
export const mover = (data) => !ended(data) && data.seats[shown(data).turn].kind === "user";
export const waiting = (data) => data.status === "pending" && data.seats[data.turn].kind !== "user";
export const live = (data) => data.status !== "ended";
export const locked = (data) => data.moves.length > 0 || data.status === "ended";
export const plies = (data) => data.moves.length;
export const at = (data) => (rewound(data) ? data.cursor : plies(data));

export const ranks = (orientation) => (orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8]);
export const files = (orientation) => (orientation === "white" ? [...FILES] : [...FILES].reverse());

export const squares = (orientation) =>
  ranks(orientation).flatMap((rank, row) =>
    files(orientation).map((file, column) => ({ at: `${file}${rank}`, column, row, light: (FILES.indexOf(file) + rank) % 2 === 0 })));

const DESTS = [
  [(data, from) => from === null, () => []],
  [(data, from) => !Object.hasOwn(data.dests, from), () => []],
  [() => true, (data, from) => data.dests[from]],
];
export const targets = (data, from) => DESTS.find(([test]) => test(data, from))[1](data, from);

export const owns = (data, at) => {
  const piece = pieces(shown(data).fen)[at];
  return piece !== undefined && sideOf(piece) === shown(data).turn;
};

export const promotes = (data, uci) => {
  const piece = pieces(shown(data).fen)[uci.slice(0, 2)];
  return (piece === "P" && uci[3] === "8") || (piece === "p" && uci[3] === "1");
};

export const king = (data) => {
  const sought = shown(data).turn === "white" ? "K" : "k";
  const found = Object.entries(pieces(shown(data).fen)).find(([, piece]) => piece === sought);
  return found === undefined ? null : found[0];
};

const census = (fen) => {
  const counts = { white: { q: 0, r: 0, b: 0, n: 0, p: 0 }, black: { q: 0, r: 0, b: 0, n: 0, p: 0 } };
  for (const piece of Object.values(pieces(fen))) if (piece.toLowerCase() in VALUE) counts[sideOf(piece)][piece.toLowerCase()]++;
  return counts;
};

const worth = (held) => ORDER.reduce((sum, role) => sum + VALUE[role] * held[role], 0);

export const material = (data) => {
  const before = census(data.initial);
  const after = census(shown(data).fen);
  const lost = (side) => ORDER.flatMap((role) => Array(Math.max(0, before[side][role] - after[side][role])).fill(role));
  const edge = worth(after.white) - worth(after.black);
  return { lost: { white: lost("white"), black: lost("black") }, edge: { white: edge, black: -edge } };
};

const LEFT = [
  [(clock, side) => clock[side] === undefined, (clock) => clock.initial],
  [() => true, (clock, side) => clock[side]],
];
export const seconds = (clock, side, now) => {
  const held = LEFT.find(([test]) => test(clock, side))[1](clock, side);
  return clock.running === side && clock.at !== undefined ? held - (now - Date.parse(clock.at)) / 1000 : held;
};
export const clockText = (clock, side, now) => {
  const whole = Math.floor(Math.max(0, seconds(clock, side, now)));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const NAMES = [
  [(seat) => seat.kind === "user", () => "you"],
  [(seat) => seat.kind === "engine", () => "stockfish"],
  [(seat) => seat.kind === "hallucinator", () => "model"],
  [() => true, () => "remote"],
];
export const named = (seat) => NAMES.find(([test]) => test(seat))[1](seat);

const OPTIONS = [
  [(seat) => seat.kind === "engine" && seat.elo === undefined, () => "1600 elo"],
  [(seat) => seat.kind === "engine", (seat) => `${seat.elo} elo`],
  [(seat) => seat.kind === "hallucinator" && seat.assisted === true, () => "assisted"],
  [(seat) => seat.kind === "hallucinator", () => "unassisted"],
  [() => true, () => ""],
];
export const option = (seat) => OPTIONS.find(([test]) => test(seat))[1](seat);

export const rival = (data) => opponent(seated(data));

export const pairs = (sans) => {
  const rows = [];
  for (let index = 0; index < sans.length; index += 2) rows.push({ number: index / 2 + 1, white: sans[index], black: index + 1 < sans.length ? sans[index + 1] : "", plies: [index + 1, index + 2] });
  return rows;
};

const SETTINGS = [
  [(data) => data.render === undefined, () => "auto"],
  [() => true, (data) => data.render],
];
export const setting = (data) => SETTINGS.find(([test]) => test(data))[1](data);
export const next = (list, current) => list[(list.indexOf(current) + 1) % list.length];
