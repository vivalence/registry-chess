import { v } from "@vivalence/typology";

// the mode's own copy of the seat vocabulary. a mode never imports outside its directory — the
// domain's OCCUPANT is reached at runtime as daemon.domain.schematics.OCCUPANT, but an App's buffer
// schema is declared at load, so the shape is restated here and pinned equal by the suite.
export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const UCI = v.string().desc('A move as UCI. Example: "e2e4".');

export const OCCUPANT = v
  .union([
    v.object({ kind: v.const("user"), user: v.string().optional().desc('The identity in the seat; the caller when absent. Example: "01JQ…".') }),
    v.object({
      kind: v.const("hallucinator"),
      tune: v.string().optional().desc('The cortex tune the seat plays with. Example: "capable".'),
      assisted: v.boolean().default(false).optional().desc("Whether the model sees the engine's assessment before choosing. Example: true."),
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
    white: v.number().optional().desc("Seconds white has left. Example: 176.4."),
    black: v.number().optional().desc("Seconds black has left. Example: 180."),
    running: v.enum(["white", "black"]).optional().desc('Whose clock ticks. Example: "white".'),
    at: v.string().optional().desc("ISO time the running clock was last read. Example: \"2026-09-16T12:00:00.000Z\"."),
  })
  .desc("A time control and both clocks, in seconds. Absent for untimed play. Example: { initial: 300, increment: 3 }.");

// a line the match left behind: the moves that stood from `ply` on before someone rewound past
// it and played something else. PGN's own shape for this is the RAV (§8.2.5), and that is where
// these land when the game is sealed — the main line stays the line that was actually finished.
export const VARIATION = v.object({
  ply: v.integer().desc("The ply this line branched at, 1-based — its first move. Example: 7."),
  moves: v.array(UCI).desc('The abandoned line as UCI, from that ply on. Example: ["g1f3", "b8c6"].'),
});

export const MARK = v.object({
  ply: v.integer(),
  kind: v.enum(["fallback", "retry", "agent"]).desc('What happened at this ply — the loop stepped in, or the agent played it for the seat. Example: "fallback".'),
  tried: v.array(v.string()).desc("What the seat answered before the fallback; empty for an agent's move. Example: [\"e2e5\"]."),
});

export const MATCH = {
  variant: v.string().default("standard").desc('Rules in force. Example: "standard".'),
  initial: v.string().default(START).desc("Starting position as FEN. Example: START."),
  fen: v.string().default(START).desc("Current position — derived from initial + moves, kept so the board renders without replaying. Example: \"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\"."),
  moves: v.array(UCI).default([]).desc('The main line as UCI, in order — the truth while playing. Example: ["e2e4", "e7e5"].'),
  sans: v.array(v.string()).default([]).desc('The same line as SAN, for eyes. Example: ["e4", "e5"].'),
  seats: SEATS.default({ white: { kind: "user" }, black: { kind: "engine" } }),
  clock: CLOCK.optional(),
  status: v.enum(["pending", "playing", "ended"]).default("pending").desc('Where the match is. Example: "playing".'),
  turn: v.enum(["white", "black"]).default("white").desc('Whose move. Example: "black".'),
  result: v.string().optional().desc('Example: "1-0".'),
  reason: v.string().optional().desc('Example: "resignation".'),
  offers: v.object({ draw: v.enum(["white", "black"]).optional() }).default({}).desc('A standing offer and who made it. Example: { draw: "black" }.'),
  marks: v.array(MARK).default([]).desc("Plies the seat did not play itself: the loop stepped in, or the agent moved for it. Example: [{ ply: 3, kind: \"fallback\", tried: [\"e2e5\"] }]."),
  opening: v.object({ eco: v.string(), name: v.string(), lastBookPly: v.integer() }).optional().desc("The opening once classified."),
  game: v.string().optional().desc("The sealed game literal's id once the match ended. Example: \"01JQ…\"."),
  thinking: v.string().optional().desc("What the hallucinator seat said about its last move, one line. Example: \"Developing with tempo on the queen.\"."),
  // the board's affordances, computed at every save so the view never asks the wire for them
  dests: v.record(v.string(), v.array(v.string())).default({}).desc('Legal destinations per from-square in the current position. Example: { e2: ["e3", "e4"] }.'),
  check: v.boolean().default(false).desc("Whether the side to move is in check. Example: false."),
  // rewinding: declared at the match's birth and baked at the first move, like the seats and the
  // clock — the sealed record must not lie about how the game was played
  rewindable: v.boolean().default(false).desc("Whether the match may be stepped back and played on from an earlier ply. Example: true."),
  cursor: v.integer().optional().desc("The ply the board is showing while rewound; absent when it shows the live position. Example: 4."),
  shown: v.object({ fen: v.string(), turn: v.enum(["white", "black"]), lastMove: v.string().optional() }).optional().desc("The rewound position the board is drawing, computed at every save; absent when the board shows the tip."),
  variations: v.array(VARIATION).default([]).desc("The lines this match left behind, in the order they were abandoned."),
};

// the strengths the engine seat's chip cycles through — stockfish's UCI_Elo floor is 1320
export const ELOS = [1320, 1600, 2000, 2400, 2800];
