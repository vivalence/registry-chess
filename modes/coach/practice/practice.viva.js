import { App, v } from "@vivalence/typology";

export { aperture } from "./aperture/index.js";
export { harness } from "./harness.js";
export { tools } from "./tools/index.js";

export const manifest = {
  type: "coach",
  slug: "practice",
  name: "Practice",
  description:
    "Agentic practice: a coach that plays you. The coach is a hallucinator armed with the board, the engine's assessment and one move " +
    "per turn; it answers your move on the board and in the dock — what you did, what to look for. The board is the buffer; the talk is the thread.",
  version: "0.1.0",
  traits: ["APPLICATION", "STANDALONE", "EXPOSED", "HARNESSED", "CONVERSATIONAL", "TOOLING"],
};

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const STRENGTHS = ["gentle", "club", "strong"];

export const application = new App(
  "buffer/Practice.svelte",
  v
    .buffer({
      data: {
        student: v.enum(["white", "black"]).default("white").desc('Which side the student plays. Example: "white".'),
        strength: v.enum(STRENGTHS).default("club").desc('How hard the coach plays: gentle keeps it instructive, strong plays the engine\'s move. Example: "club".'),
        initial: v.string().default(START).desc("Starting position as FEN."),
        fen: v.string().default(START).desc("Current position."),
        moves: v.array(v.string()).default([]).desc("The line as UCI."),
        sans: v.array(v.string()).default([]).desc("The line as SAN."),
        turn: v.enum(["white", "black"]).default("white"),
        status: v.enum(["pending", "playing", "ended"]).default("pending"),
        result: v.string().optional(),
        reason: v.string().optional(),
        notes: v.array(v.object({ ply: v.integer(), text: v.string() })).default([]).desc("The coach's line per ply it commented on. Example: [{ ply: 2, text: \"Meeting the centre.\" }]."),
        waiting: v.boolean().default(false).desc("True while the coach is thinking — the board waits for the buffer to change. Example: true."),
        game: v.string().optional().desc("The sealed game literal's id once over."),
        ladders: v.record(v.string(), v.record(v.string(), v.unknown())).default({}).desc("The domain's limitstrength ladder per ply asked, keyed by ply number. Example: { \"1\": { elo: 1600, san: \"e4\", verdict: \"a club player's move\" } }."),
        // the board's affordances, computed at every save so the view never asks the wire for them
        dests: v.record(v.string(), v.array(v.string())).default({}).desc('Legal destinations per from-square in the current position. Example: { e2: ["e3", "e4"] }.'),
        check: v.boolean().default(false).desc("Whether the side to move is in check. Example: false."),
      },
      literals: v.array(v.rel(v.literal())).desc("The sealed game, once over."),
    })
    .desc("One practice game against the coach. The student moves through /practice/move; the coach answers through its tools when /practice/turn runs. Example: /practice/create { student: \"white\", strength: \"club\" }."),
);
