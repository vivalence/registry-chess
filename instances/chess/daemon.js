import paladin from "@vivalence/paladin";

export const chess = {
  manifest: {
    type: "daemon",
    slug: "chess",
    version: "0.1.0",
    name: "Chess",
    description: "Play, study, riddles, practice, library — over one corpus of games, positions, openings and puzzles, with an engine behind the door.",
    icon: { emoji: "♞" },
  },
  kernel: [
    "@chess/domain/chess",
    "@chess/topology/game",
    "@chess/topology/position",
    "@chess/topology/opening",
    "@chess/topology/puzzle",
    "@chess/topography/openings",
    "@chess/topography/puzzles",
    "@chess/board/play",
    "@chess/study/analysis",
    "@chess/riddle/puzzles",
    "@chess/coach/practice",
    "@chess/coach/coach",
    "@chess/library/games",
  ],
  consume: {
    engine: {
      module: "@chess/service/stockfish",
      statics: {
        binary: () => paladin.env.get("VIVA_SERVICE_STOCKFISH_BINARY"),
        threads: () => Number(paladin.env.get("VIVA_SERVICE_STOCKFISH_THREADS")),
        hash: () => Number(paladin.env.get("VIVA_SERVICE_STOCKFISH_HASH")),
      },
    },
  },
};
