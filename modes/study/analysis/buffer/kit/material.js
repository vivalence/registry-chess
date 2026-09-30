// what each side has lost, and who is ahead — read off two FENs, never from a move list, so a
// rewound board tells the truth about the position it is showing. the glyphs carry U+FE0E: the
// pawn is the one chess sign that is also an emoji, and a colour bitmap ignores `color`.
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const GLYPH = { q: "♛︎", r: "♜︎", b: "♝︎", n: "♞︎", p: "♟︎" };
const VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };
// the strip reads big to small, the way a captured pile is scanned
const ORDER = ["q", "r", "b", "n", "p"];

const census = (fen) => {
  const counts = { white: {}, black: {} };
  for (const char of String(fen ?? "").split(" ")[0] ?? "") {
    const role = char.toLowerCase();
    if (!(role in VALUE)) continue;
    const side = char === role ? "black" : "white";
    counts[side][role] = (counts[side][role] ?? 0) + 1;
  }
  return counts;
};

const worth = (held) => ORDER.reduce((sum, role) => sum + VALUE[role] * (held[role] ?? 0), 0);

// `lost` is what the side no longer has, against the position the match began from — a promoted
// pawn reads as a pawn lost, which is what the pile on the table would hold. `edge` is the real
// material on the board, so a promotion counts for the side that earned it.
export function captures({ fen, initial = START } = {}) {
  const before = census(initial);
  const after = census(fen ?? initial);
  const lost = {};
  for (const side of ["white", "black"]) {
    lost[side] = ORDER.flatMap((role) => Array.from({ length: Math.max(0, (before[side][role] ?? 0) - (after[side][role] ?? 0)) }, () => GLYPH[role]));
  }
  const edge = worth(after.white) - worth(after.black);
  return { lost, edge: { white: edge, black: -edge } };
}
