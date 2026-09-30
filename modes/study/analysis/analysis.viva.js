import { App, v } from "@vivalence/typology";
import { shard, Vector } from "@vivalence/typology";

export { aperture } from "./aperture/index.js";

export const manifest = {
  type: "study",
  slug: "analysis",
  name: "Analysis",
  description:
    "The post-mortem. A game — from the corpus or pasted as PGN — on a board you step through; the engine's evaluation at every " +
    "ply, every move judged by win percentage lost, accuracy per side; a hallucinator that explains one move in words from what the engine found.",
  version: "0.1.0",
  traits: ["APPLICATION", "STANDALONE", "EXPOSED", "HARNESSED"],
};

const EXPLAIN = [
  "You explain one chess move to the player who made it, from the engine's findings you are handed.",
  "Say what the move did, what the engine preferred and why that line is better, in plain words a club player follows.",
  "Never invent a line the engine did not produce. Three sentences at most, no headings.",
].join(" ");

export const harness = new Vector()
  .use(shard.hal.defaults({ policy: { tune: "capable", rounds: 1 }, settings: { effort: "low" } }))
  .use(async (ctx, next) => {
    ctx.hallucination.system.explain = EXPLAIN;
    await next();
  });

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const application = new App(
  "buffer/Analysis.svelte",
  v
    .buffer({
      data: {
        game: v.string().optional().desc("The game literal's id when loaded from the corpus. Example: \"01JQ…\"."),
        title: v.string().default("").desc('A line naming the game. Example: "Anderssen – Kieseritzky 1-0".'),
        tags: v.record(v.string(), v.string()).default({}).desc('The PGN tags the game came with. Example: { Site: "Paris", Date: "1858.??.??", Result: "1-0" }.'),
        opening: v.object({ eco: v.string(), name: v.string(), lastBookPly: v.integer() }).optional().desc('The opening the line reaches, when catalogued. Example: { eco: "C41", name: "Philidor Defense", lastBookPly: 4 }.'),
        initial: v.string().default(START).desc("Starting position as FEN."),
        moves: v.array(v.string()).default([]).desc("The main line as UCI."),
        sans: v.array(v.string()).default([]).desc("The same line as SAN."),
        fens: v.array(v.string()).default([]).desc("One FEN per position, the start first — fens[i] is the position before ply i+1. Example: [\"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\", \"…\"]."),
        cursor: v.integer().default(0).desc("Which position is on the board: 0 is the start, n is after ply n. Example: 12."),
        depth: v.integer().default(14).desc("Search depth per position. Example: 14."),
        status: v.enum(["idle", "running", "done", "failed"]).default("idle").desc('Where the analysis is. Example: "done".'),
        progress: v.object({ done: v.integer(), total: v.integer(), message: v.string().optional() }).optional(),
        report: v.record(v.string(), v.unknown()).optional().desc("The domain's ANALYSED report once run: accuracy, acpl, counts, judgements. Example: { accuracy: { white: 84.7, black: 61.2 }, acpl: { white: 12, black: 40 }, judgements: [] }."),
        explanations: v.record(v.string(), v.string()).default({}).desc("Prose per ply the hallucinator has explained, keyed by ply number. Example: { \"6\": \"The bishop check was met by the king walk.\" }."),
        ladders: v.record(v.string(), v.record(v.string(), v.unknown())).default({}).desc("The domain's limitstrength ladder per ply asked, keyed by ply number. Example: { \"1\": { elo: 1600, san: \"e4\", verdict: \"a club player's move\" } }."),
      },
      literals: v.array(v.rel(v.literal())).desc("The game literal, when the study is over a corpus game. Example: []."),
    })
    .desc("One game under the lens. Load it, run the engine over every position, step through the judgements, ask why. Example: /analysis/load { pgn: \"1. e4 e5 2. Nf3 *\" }."),
);
