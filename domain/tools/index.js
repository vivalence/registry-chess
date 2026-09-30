import { v, Vector } from "@vivalence/typology";
import * as rules from "../rules/index.js";
import * as types from "../schematics.js";
import { ladder, lines } from "../aperture/index.js";

// the tools every chess mode's agent shares, armed as chess_*. an agent that can read a board,
// ask the engine, name the opening and fetch a riddle.
export const tools = new Vector()
  .open(
    {
      nature: "/legal",
      valence:
        "Read a position: whose move, every legal move as UCI and SAN, check, mate, stalemate. " +
        "Call this before choosing a move — the list is the only moves you may play. Example: { fen: \"…\" }.",
      input: v.object({ fen: types.FEN, variant: types.VARIANT }),
    },
    (ctx) => {
      const { moves, dests: _dests, ...state } = rules.legal(ctx.input);
      return { ...state, moves, message: `${state.turn} to move · ${moves.length} legal · ${state.check ? "in check" : "no check"}${state.end ? ` · game over ${state.outcome?.result ?? ""}` : ""}` };
    },
  )
  .open(
    {
      nature: "/assess",
      valence:
        "The engine's top lines at a position — how many lines, how many plies deep, from what search depth — scored from the side to move's view, walked into SAN. " +
        "Cached per position. Without an engine it says so; do not guess an evaluation. Example: { fen: \"…\", multipv: 3, depth: 14, plies: 6 }.",
      input: v.object({
        fen: types.FEN,
        multipv: v.integer().default(3).optional().desc("How many lines. Example: 3."),
        depth: v.integer().default(14).optional().desc("Search depth. Example: 14."),
        plies: v.integer().default(6).optional().desc("How deep each line is walked, in plies. Example: 6."),
      }),
    },
    async (ctx) => {
      const found = await lines(ctx, ctx.input);
      if (!found.lines.length) return { condition: "ERROR", message: found.message };
      return found;
    },
  )
  .open(
    {
      nature: "/elo",
      valence:
        "Which strength plays a move: the position searched several times at 1320, 1600, 2000, 2400, 2800 and full strength. The answer is the " +
        "highest strength that still picks the move at least half the time and what stronger searches prefer — a number for the move, never a rating of the player. " +
        'Needs the engine; cached per position. Example: { fen: "…", uci: "e2e4" }.',
      input: v.object({ fen: types.FEN, uci: types.UCI }),
    },
    async (ctx) => {
      const found = await ladder(ctx, ctx.input);
      if (!found.rungs) return { condition: "ERROR", message: found.message };
      const shown = (rung) => {
        const played = Math.round(rung.share * rung.plays.length);
        const often = played > 0 && played < rung.plays.length ? ` ${played}/${rung.plays.length}` : "";
        return rung.agrees ? `${rung.elo}: ${rung.san}${often} ✓` : `${rung.elo}: ${rung.san}${played ? ` (${found.san}${often})` : ""}`;
      };
      const rungs = found.rungs.map(shown).join(" · ");
      return { ...found, message: `${found.san} — ${found.verdict}. ${found.sentence}\n${rungs}` };
    },
  )
  .open(
    {
      nature: "/classify",
      valence: 'Name the opening a line of moves reaches. Example: { moves: ["e2e4", "c7c5"] }.',
      input: v.object({ moves: types.MOVES }),
    },
    async (ctx) => {
      const line = rules.replay({ moves: ctx.input.moves });
      const found = await ctx.daemon.entities.literal.classify([rules.START, ...line.plies.map((ply) => ply.fen)]);
      if (!found) return { eco: null, name: null, message: "no catalogued opening on this line" };
      return { eco: found.eco, name: found.name, lastBookPly: found.lastBookPly, message: `${found.eco} ${found.name} (book to ply ${found.lastBookPly})` };
    },
  )
  .open(
    {
      nature: "/puzzle",
      valence: 'Fetch one riddle in a level — the position and whose move, never the solution. Example: { level: "club" }.',
      input: v.object({
        level: v.enum(types.LEVELS.map((band) => band.slug)).optional().desc('A level band. Example: "novice".'),
        themes: v.array(v.string()).optional(),
      }),
    },
    async (ctx) => {
      const row = await ctx.daemon.entities.literal.puzzle(ctx.input);
      if (!row) return { condition: "ERROR", message: "no puzzle in that level — is @chess/topography/puzzles kernelled?" };
      const { solution, ...posed } = row.trait.POSED;
      return { id: row.id, ...posed, plies: solution.length, message: `puzzle ${row.slug} · ${posed.level} (${posed.rating}) · ${posed.fen.split(" ")[1]} to move · ${solution.length} plies` };
    },
  );
