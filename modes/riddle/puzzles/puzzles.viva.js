import { App, v } from "@vivalence/typology";

export { aperture } from "./aperture/index.js";

export const manifest = {
  type: "riddle",
  slug: "puzzles",
  name: "Riddles",
  description:
    "Chess riddles in five levels, novice to master. One position, whose move, find the line; the opponent's replies are played " +
    "for you; a nudge names the piece. Every attempt is a trace, so a streak is yours across sessions.",
  version: "0.1.0",
  traits: ["APPLICATION", "STANDALONE", "EXPOSED"],
};

export const LEVELS = ["novice", "apprentice", "club", "expert", "master"];

// what each level asks of the solver — the bands are the domain's puzzle.level.* symbols
export const ASKS = {
  novice: "under 1000 · one idea",
  apprentice: "1000–1400 · two moves deep",
  club: "1400–1800 · a sacrifice or a quiet move",
  expert: "1800–2200 · calculation",
  master: "2200 and up · the engine's taste",
};

export const application = new App(
  "buffer/Riddles.svelte",
  v
    .buffer({
      data: {
        level: v.enum(LEVELS).default("novice").desc('The level being played. Example: "club".'),
        puzzle: v
          .object({
            id: v.string(),
            slug: v.string(),
            fen: v.string(),
            rating: v.integer(),
            level: v.string(),
            themes: v.array(v.string()),
            plies: v.integer(),
            side: v.string(),
          })
          .optional()
          .desc("The riddle on the board — never its solution. Example: { id: \"01JQ…\", slug: \"puzzle-abc\", fen: \"…\", rating: 1500, level: \"club\", themes: [\"fork\"], plies: 3, side: \"w\" }."),
        fen: v.string().optional().desc("The position on the board now, after what has been played. Example: \"r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4\"."),
        played: v.array(v.string()).default([]).desc("The line played so far, solver and opponent alike, as UCI. Example: [\"e1e7\", \"f8e8\"]."),
        status: v.enum(["idle", "solving", "solved", "failed"]).default("idle").desc('Example: "solving".'),
        hint: v.string().optional().desc("The square the next solving move leaves from, once asked. Example: \"g1\"."),
        solution: v.array(v.string()).optional().desc("Revealed only once the riddle is over."),
        line: v.array(v.string()).optional().desc('The solution as SAN, once over. Example: ["Qxf7#"].'),
        missed: v.string().optional().desc('The wrong move that ended the riddle, as UCI. Example: "h5h7".'),
        mistake: v
          .object({
            ply: v.integer().desc("Which ply of the line went wrong, from 1. Example: 1."),
            san: v.string().desc('The move played, as SAN. Example: "Qh7+".'),
            wanted: v.string().optional().desc('The move the riddle wanted there, as SAN. Example: "Qxf7#".'),
            refutation: v
              .object({
                sans: v.array(v.string()).desc('The engine\'s answer to the move played, as SAN. Example: ["Kxh7", "Rh3+", "Kg8"].'),
                cp: v.number().optional().desc("Centipawns after the move played, from the solver's side. Example: -320."),
                mate: v.integer().optional().desc("Mate in n after the move played, from the solver's side — negative when the solver is mated. Example: -2."),
              })
              .optional()
              .desc("Absent when no engine is consumed."),
          })
          .optional()
          .desc('Why the riddle ended, once a wrong move ended it. Example: { ply: 1, san: "Qh7+", wanted: "Qxf7#", refutation: { sans: ["Kxh7"], cp: -320 } }.'),
        replay: v.boolean().default(false).desc("Whether this riddle is being tried again — a replay moves no tally. Example: false."),
        streak: v.integer().default(0).desc("Solved in a row, no hints. Example: 4."),
        solved: v.integer().default(0),
        failed: v.integer().default(0),
        nudges: v.integer().default(0).desc("Hints asked for in this buffer. Example: 1."),
        seen: v.array(v.string()).default([]).desc("Puzzle ids already served in this buffer. Example: [\"01JQ…\"]."),
        // the board's affordances, computed at every save so the view never asks the wire for them
        dests: v.record(v.string(), v.array(v.string())).default({}).desc('Legal destinations per from-square while solving. Example: { h5: ["f7", "h7"] }.'),
        check: v.boolean().default(false).desc("Whether the side to move is in check. Example: false."),
      },
      literals: v.array(v.rel(v.literal())).desc("The current riddle's literal."),
    })
    .desc("One riddle at a time, a streak across them. /riddle/next serves, /riddle/move checks, /riddle/hint nudges. Example: /riddle/open { level: \"club\" }."),
);
