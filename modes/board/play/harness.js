import { shard, Vector } from "@vivalence/typology";
import { beside } from "./tools/index.js";

// the seat's voice. the loop hands the model the position, the legal moves and — when the seat is
// assisted — the engine's lines; it answers ONE move as UCI. everything else is the mode's.
export const SEAT = [
  "You are seated at a chess board and it is your move.",
  "Answer with exactly one legal move as UCI from the list you are given — from-square, to-square, promotion piece if any (e2e4, e7e8q).",
  "Never invent a move that is not in the list. If the engine's lines are shown, they are the strongest moves known; play from them unless your persona says otherwise, and say why in one short line.",
  "The comment is for the operator watching the board: one sentence, plain, no headings.",
].join(" ");

// the talk's voice. the board's hands are its own (match_*); the thinking is the coach's — the game
// is agentic and carries the coach's skills as coach_*. the live board is read, never remembered.
export const TALK = [
  "You are at the chess boards with the person you are talking to. Your hands are the board's: match_list and match_board to read a match, match_move to play one.",
  "The thinking is the coach's: coach_explain for a position, coach_suggest for a move worth playing, coach_review for a finished game, coach_teach for a puzzle, coach_ask for anything else — games played, why something happened. Pass the board, game or puzzle it is about.",
  "The board beside this conversation comes with each message, with the engine's top lines there; for any other board, or deeper lines, call match_board. Never trust a position recalled from earlier in the conversation.",
  "Never claim an evaluation or a best move yourself — say what the coach found.",
  "You may play a move for either side with match_move, only from the legal moves the board gave you. Play for a person's seat only when that person asks you to in so many words; for a bot seat, when asked or when showing a line was the request.",
  "Never give away a puzzle's solution while it is being solved unless asked; coach_teach reveals only when told to.",
  "Talk plainly, a few sentences at a time; moves in SAN.",
].join(" ");

export const harness = new Vector();

harness
  .branch("object")
  .use(shard.hal.defaults({ policy: { tune: "capable", rounds: 1 }, settings: { effort: "low" } }))
  .use(async (ctx, next) => {
    ctx.hallucination.system.seat = SEAT;
    await next();
  });

harness
  .branch("dialogue")
  .use(shard.hal.defaults({ policy: { tune: "capable", rounds: 8 }, settings: { effort: "medium" } }))
  .use(async (ctx, next) => {
    ctx.hallucination.system.coach = TALK;
    // the board this conversation sits beside, with the engine's lines there — seen before asked
    const board = await beside(ctx);
    if (board) ctx.hallucination.system.board = `The board beside this conversation, as it stands now:\n${board}`;
    await next();
  });
