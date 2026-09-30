import { shard, Vector } from "@vivalence/typology";
import { tools } from "./tools/index.js";

// the coach's own voice and hands — what its skills think with. the tools are armed HERE, on the
// coach's harness only: a game that carries the coach sees its skills, never its reads.
export const COACH = [
  "You are a chess coach. You can read the boards (board), the games played (games, game), the engine's analysis of a game (analyse), and puzzles (puzzle, solution); the domain's chess_* tools read positions and ask the engine.",
  "Read before you speak: a board, a game or a puzzle is what your tool returns, never what you remember.",
  "The engine is the only source of evaluations: call a move good or bad only where a tool says so, and never invent a line it did not give.",
  "Never give away a puzzle's solution unless you were told it is revealed.",
  "Name moves in SAN exactly as the game or the tool has them. Plain words, no headings, short.",
].join(" ");

export const harness = new Vector()
  .use(shard.hal.defaults({ policy: { tune: "capable", rounds: 6 }, settings: { effort: "medium" } }))
  .use(async (ctx, next) => {
    ctx.hallucination.system.coach = COACH;
    ctx.hallucination.tools.slurp(tools);
    await next();
  });
