// lichess's win-percentage model and accuracy formula. the only numbers in the domain a reader
// cannot check by eye, so they live here as pure functions with a suite against the reference
// points lichess publishes.

// centipawns → win % for the side the score is from. 0 → 50, +100 → ~59.1, +500 → ~86.
export const winPercent = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

// a mate score is a win or a loss; the sign says which.
export const winPercentMate = (mate) => (mate > 0 ? 100 : 0);

// one engine line → win % for the side to move.
export const winPercentOf = (line) => {
  if (line == null) return 50;
  if (typeof line.mate === "number") return winPercentMate(line.mate);
  if (typeof line.cp === "number") return winPercent(Math.max(-1500, Math.min(1500, line.cp)));
  return 50;
};

// accuracy of one move from the win % before and after it, both from the mover's view. a move
// that loses nothing scores 100; the curve is lichess's.
export const accuracy = (before, after) => {
  const lost = Math.max(0, before - after);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * lost) - 3.1669));
};

export const THRESHOLDS = { inaccuracy: 10, mistake: 20, blunder: 30 };

// win % lost → a word.
export const judgeLoss = (loss, { same = false } = {}) => {
  if (loss >= THRESHOLDS.blunder) return "blunder";
  if (loss >= THRESHOLDS.mistake) return "mistake";
  if (loss >= THRESHOLDS.inaccuracy) return "inaccuracy";
  return same ? "best" : "good";
};
