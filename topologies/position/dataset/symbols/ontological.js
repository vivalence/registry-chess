const symbol = (slug, name, description, root = false) => ({
  slug,
  traits: ["ONTOLOGICAL", "LABELED", ...(root ? ["TOPOGRAPHICAL"] : [])],
  trait: { ONTOLOGICAL: {}, LABELED: { name, description }, ...(root ? { TOPOGRAPHICAL: {} } : {}) },
});

export default [
  symbol("position", "Position", "One chess position, identified by its EPD. Core ontological dimension.", true),
  symbol("position.phase.opening", "Opening", "The first moves — development, the centre, the king."),
  symbol("position.phase.middlegame", "Middlegame", "Pieces out, plans in play."),
  symbol("position.phase.endgame", "Endgame", "Few pieces; the king walks."),
  ...[3, 4, 5, 6, 7].map((pieces) =>
    symbol(
      `position.endgame.pieces.${pieces}`,
      `${pieces}-piece endgame`,
      pieces <= 5 ? "At or under the shipped Syzygy limit — a tablebase answers exactly." : "A tablebase exists for it; none is shipped.",
    ),
  ),
];
