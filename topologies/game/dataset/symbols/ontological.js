const symbol = (slug, name, description, root = false) => ({
  slug,
  traits: ["ONTOLOGICAL", "LABELED", ...(root ? ["TOPOGRAPHICAL"] : [])],
  trait: { ONTOLOGICAL: {}, LABELED: { name, description }, ...(root ? { TOPOGRAPHICAL: {} } : {}) },
});

const VARIANTS = [
  ["standard", "Standard", "The rules of chess."],
  ["chess960", "Chess960", "Fischer random — the back rank shuffled, castling by the pieces' start squares."],
  ["atomic", "Atomic", "Captures explode."],
  ["antichess", "Antichess", "Lose every piece to win; captures are forced."],
  ["crazyhouse", "Crazyhouse", "Captured pieces change sides and may be dropped."],
  ["horde", "Horde", "A pawn army against a full set."],
  ["kingofthehill", "King of the Hill", "A king reaching the centre wins."],
  ["racingkings", "Racing Kings", "First king to the eighth rank wins; no checks."],
  ["threecheck", "Three-check", "Three checks win."],
];

const RESULTS = [
  ["white", "White won", "1-0"],
  ["black", "Black won", "0-1"],
  ["draw", "Draw", "1/2-1/2"],
  ["unfinished", "Unfinished", "* — no result yet, or none recorded."],
];

const TERMINATIONS = [
  ["checkmate", "Checkmate", "The king could not escape."],
  ["resignation", "Resignation", "One side gave up."],
  ["stalemate", "Stalemate", "No legal move, no check."],
  ["insufficient", "Insufficient material", "Neither side can mate."],
  ["repetition", "Repetition", "The same position three times."],
  ["fifty-moves", "Fifty-move rule", "Fifty moves without a capture or a pawn move."],
  ["agreement", "Draw by agreement", "Both sides agreed."],
  ["timeout", "Timeout", "A flag fell."],
  ["abandoned", "Abandoned", "Left unfinished."],
];

const TIMECONTROLS = [
  ["bullet", "Bullet", "Under three minutes a side."],
  ["blitz", "Blitz", "Three to eight minutes a side."],
  ["rapid", "Rapid", "Eight to twenty-five minutes a side."],
  ["classical", "Classical", "More than twenty-five minutes a side."],
  ["correspondence", "Correspondence", "No clock."],
];

export default [
  symbol("game", "Game", "A game of chess. Core ontological dimension.", true),
  ...VARIANTS.map(([slug, name, description]) => symbol(`game.variant.${slug}`, name, description)),
  ...RESULTS.map(([slug, name, description]) => symbol(`game.result.${slug}`, name, description)),
  ...TERMINATIONS.map(([slug, name, description]) => symbol(`game.termination.${slug}`, name, description)),
  ...TIMECONTROLS.map(([slug, name, description]) => symbol(`game.timecontrol.${slug}`, name, description)),
];
