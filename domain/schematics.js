import { v } from "@vivalence/typology";
import { START, VARIANTS } from "./rules/index.js";

export { START, VARIANTS };

export const RESULTS = ["1-0", "0-1", "1/2-1/2", "*"];

export const REASONS = [
  "checkmate",
  "resignation",
  "stalemate",
  "insufficient",
  "repetition",
  "fifty-moves",
  "agreement",
  "timeout",
  "abandoned",
];

export const JUDGEMENTS = ["best", "good", "inaccuracy", "mistake", "blunder"];

export const PHASES = ["opening", "middlegame", "endgame"];

// riddle levels — bands over a puzzle's rating. the band names are the symbol slugs under
// puzzle.level.*; the numbers are lichess puzzle ratings.
export const LEVELS = [
  { slug: "novice", name: "Novice", from: 0, to: 1000 },
  { slug: "apprentice", name: "Apprentice", from: 1000, to: 1400 },
  { slug: "club", name: "Club", from: 1400, to: 1800 },
  { slug: "expert", name: "Expert", from: 1800, to: 2200 },
  { slug: "master", name: "Master", from: 2200, to: 9999 },
];

export const level = (rating) => (LEVELS.find((band) => rating >= band.from && rating < band.to) ?? LEVELS.at(-1)).slug;

export const FEN = v.string().desc(
  'A position as FEN. Example: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".',
);
export const UCI = v.string().desc('A move as UCI — from-square, to-square, promotion piece if any. Example: "e2e4", "e7e8q".');
export const SAN = v.string().desc('A move as SAN — for eyes, never for the wire. Example: "Nf3", "O-O", "exd5".');
export const PGN = v.string().desc('A whole game as PGN text, tags and movetext. Example: "[Event \\"?\\"]\\n\\n1. e4 e5 2. Nf3 *".');
export const VARIANT = v.enum(VARIANTS).default("standard").optional().desc('The rules in force. Example: "standard".');
export const MOVES = v.array(UCI).desc('A line of moves as UCI, in order. Example: ["e2e4", "e7e5", "g1f3"].');

// who sits in a seat. the match loop asks the occupant of the side to move for one move.
export const OCCUPANT = v
  .union([
    v.object({
      kind: v.const("user"),
      user: v.string().optional().desc('The identity in the seat; the caller when absent. Example: "01JQ…".'),
    }),
    v.object({
      kind: v.const("hallucinator"),
      tune: v.string().optional().desc('The cortex tune the seat plays with. Example: "capable".'),
      assisted: v
        .boolean()
        .default(false)
        .optional()
        .desc("Whether the model sees the engine's assessment of the position before choosing. Example: true."),
      persona: v.string().optional().desc('A voice for the seat, one sentence. Example: "a romantic attacker who loves sacrifices".'),
    }),
    v.object({
      kind: v.const("engine"),
      service: v.string().default("engine").optional().desc('The consumed service key. Example: "engine".'),
      elo: v.integer().optional().desc("UCI_Elo the engine is limited to. Example: 1600."),
      movetime: v.integer().optional().desc("Milliseconds per move. Example: 500."),
      depth: v.integer().optional().desc("Fixed search depth instead of a movetime. Example: 12."),
    }),
    v.object({
      kind: v.const("remote"),
      runtime: v.string().desc('Lighthouse-known runtime holding the seat. Example: "italian".'),
      user: v.string().desc('The identity on that runtime. Example: "01JQ…".'),
    }),
  ])
  .desc('Who sits in a seat. Example: { kind: "engine", elo: 1600, movetime: 500 }.');

export const SEATS = v.object({ white: OCCUPANT, black: OCCUPANT }).desc(
  'Both seats. Example: { white: { kind: "user" }, black: { kind: "hallucinator", assisted: true } }.',
);

export const CLOCK = v
  .object({
    initial: v.number().desc("Seconds each side starts with. Example: 180."),
    increment: v.number().default(0).desc("Seconds added per move. Example: 2."),
  })
  .desc("A time control in seconds. Example: { initial: 300, increment: 3 }.");

// one engine line, as every engine-facing surface speaks it
export const LINE = v.object({
  cp: v.integer().optional().desc("Centipawns from the side to move's view. Example: 35."),
  mate: v.integer().optional().desc("Mate in N from the side to move's view; negative when getting mated. Example: -3."),
  pv: MOVES,
});

export const EVALUATION = v
  .object({
    engine: v.string().desc('The engine that produced it. Example: "Stockfish 17".'),
    depth: v.integer().desc("Search depth reached. Example: 18."),
    multipv: v.array(LINE).desc("Best lines, best first."),
    bestmove: UCI.optional(),
    at: v.string().desc("ISO timestamp. Example: \"2026-09-16T12:00:00.000Z\"."),
  })
  .desc("One engine assessment of a position.");

export const PROGRESS = v.object({
  stage: v.string().desc('What is happening. Example: "eval".'),
  done: v.integer().desc("Units finished. Example: 12."),
  total: v.integer().desc("Units in total. Example: 80."),
  message: v.string().optional().desc('A line for the operator. Example: "ply 12 — Nf3 (+0.3)".'),
});

export const JUDGEMENT = v.object({
  ply: v.integer(),
  uci: UCI,
  san: SAN,
  before: v.number().desc("Win % for the mover before the move. Example: 54.2."),
  after: v.number().desc("Win % for the mover after the move. Example: 31.8."),
  loss: v.number().desc("Win % lost by the move. Example: 22.4."),
  judgement: v.enum(JUDGEMENTS),
  best: UCI.optional().desc("What the engine preferred, when it differs. Example: \"d4e5\"."),
  eval: LINE.optional(),
});

export const REPORT = v.object({
  engine: v.string(),
  depth: v.integer(),
  accuracy: v.object({ white: v.number(), black: v.number() }),
  acpl: v.object({ white: v.number(), black: v.number() }),
  counts: v.object({
    white: v.record(v.string(), v.integer()),
    black: v.record(v.string(), v.integer()),
  }),
  judgements: v.array(JUDGEMENT),
});

// the limitstrength ladder — the strengths one move is tried at. stockfish's UCI_Elo floor is
// 1320; "full" is the unlimited search and always comes last. the elo of a move is the HIGHEST
// rung that still picks it — a number for the move, never a rating of the player.
export const RUNGS = [1320, 1600, 2000, 2400, 2800];

export const RUNG = v.object({
  elo: v.union([v.integer(), v.const("full")]).desc('The strength tried — a UCI_Elo, or "full" for the unlimited search. Example: 1600.'),
  uci: UCI.desc('The move this strength plays most often over its samples. Example: "e2e4".'),
  san: SAN,
  plays: v.array(UCI).desc('Every move this strength played, one per sample, oldest first. Example: ["e2e4", "e2e4", "d2d4", "e2e4", "d2d4"].'),
  share: v.number().desc("How often this strength played the move asked about, 0 to 1 over its samples. Example: 0.6."),
  hold: v.number().desc("How often this strength played its most frequent move, 0 to 1 — low means it spreads over several equal moves. Example: 0.8."),
  agrees: v.boolean().desc("Whether this strength plays the move asked about at least half the time. Example: true."),
  cached: v.boolean().desc("Whether every sample came from the position literal rather than the engine. Example: false."),
});

export const LADDER = v
  .object({
    uci: UCI,
    san: SAN,
    elo: v.union([v.integer(), v.const("full"), v.null()]).desc("The highest strength that still plays the move at least half the time; null when none does. Example: 2000."),
    spread: v.union([v.integer(), v.const("full"), v.null()]).desc("The highest strength that plays the move at all, even once; null when none does. Example: 2400."),
    settled: v.boolean().desc("Whether every strength holds to one move at least 60% of the time — false where several moves are equal and any number is a sample. Example: true."),
    only: v.boolean().desc("Whether it is the only legal move. Example: false."),
    unanimous: v.boolean().desc("Whether every strength plays it. Example: false."),
    best: v.object({ uci: UCI, san: SAN }).desc('What the full-strength search plays. Example: { uci: "d2d4", san: "d4" }.'),
    switches: v
      .object({ elo: v.union([v.integer(), v.const("full")]), uci: UCI, san: SAN })
      .optional()
      .desc('The first strength above the move\'s elo that plays something else, and what. Example: { elo: 2400, uci: "d2d4", san: "d4" }.'),
    rungs: v.array(RUNG).desc('Every strength tried, ascending, full strength last. Example: [{ elo: 1320, uci: "a2a3", san: "a3", plays: ["a2a3"], share: 0, agrees: false, cached: false }].'),
    samples: v.integer().desc("Searches per strength the ladder stands on — limited-strength play is randomised, one search is noise. Example: 5."),
    hits: v.integer().desc("Rungs answered from the position literal alone, no engine search. Example: 4."),
    verdict: v.string().desc("One phrase for the number. Example: \"a club player's move\"."),
    sentence: v.string().desc('One sentence for the operator. Example: "Stockfish limited to 2000 still picks e4; at 2400 it switches to d4."'),
  })
  .desc('The limitstrength ladder for one move in one position. Example: { uci: "e2e4", san: "e4", elo: 2000, verdict: "a club player\'s move" }.');

export const STATUS = v.object({
  present: v.boolean().desc("Whether an engine service is consumed by the daemon. Example: true."),
  engine: v.string().optional().desc('The engine\'s UCI name, once it has spoken. Example: "Stockfish 17".'),
  binary: v.string().optional().desc('The binary the service spawns. Example: "stockfish".'),
  threads: v.integer().optional().desc("Threads the engine is configured with. Example: 2."),
  hash: v.integer().optional().desc("Hash table in megabytes. Example: 128."),
  started: v.boolean().optional().desc("Whether the engine process is up. Example: false."),
  message: v.string().optional().desc("Without an engine, the sentence that names the fix. Example: \"no engine is consumed by this daemon…\"."),
});
