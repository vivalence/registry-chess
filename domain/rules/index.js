// the rules of chess, behind one file. this is the ONLY module in the package that imports
// chessops — every other file speaks FEN, UCI, SAN and PGN as strings and asks here.
//
// wire conventions: UCI names a move on the wire ("e2e4", "e7e8q"), SAN is for eyes ("Nf3"),
// FEN names a position, EPD is the position without its move counters, PGN is a whole game.
import { Chess } from "https://esm.sh/chessops@0.14.2/chess";
import { INITIAL_FEN, makeFen, parseFen } from "https://esm.sh/chessops@0.14.2/fen";
import { makeSan, makeSanAndPlay, parseSan } from "https://esm.sh/chessops@0.14.2/san";
import { makeUci, parseUci, makeSquare } from "https://esm.sh/chessops@0.14.2/util";
import { chessgroundDests } from "https://esm.sh/chessops@0.14.2/compat";
import { defaultPosition, setupPosition } from "https://esm.sh/chessops@0.14.2/variant";
import { defaultGame, makePgn, parsePgn, startingPosition } from "https://esm.sh/chessops@0.14.2/pgn";

export const START = INITIAL_FEN;

// chessops rules names. "standard" is the one every mode renders; the rest are legal to declare
// and nothing in the package renders them yet.
export const VARIANTS = [
  "standard",
  "chess960",
  "atomic",
  "antichess",
  "crazyhouse",
  "horde",
  "kingofthehill",
  "racingkings",
  "threecheck",
];

const RULES = {
  standard: "chess",
  chess960: "chess",
  atomic: "atomic",
  antichess: "antichess",
  crazyhouse: "crazyhouse",
  horde: "horde",
  kingofthehill: "kingofthehill",
  racingkings: "racingkings",
  threecheck: "3check",
};

const rules = (variant = "standard") => {
  const named = RULES[variant];
  if (!named) throw new Error(`[rules] unknown variant "${variant}" — one of ${VARIANTS.join(", ")}`);
  return named;
};

// a chessops Position from a FEN, or a sentence. never returns a Result — callers get a position
// they can use or an error they can render.
export const position = (fen = START, variant = "standard") => {
  const setup = parseFen(fen).unwrap(
    (value) => value,
    (error) => {
      throw new Error(`[rules] cannot read FEN "${fen}" — ${error.message}`);
    },
  );
  return setupPosition(rules(variant), setup).unwrap(
    (value) => value,
    (error) => {
      throw new Error(`[rules] illegal position "${fen}" — ${error.message}`);
    },
  );
};

export const initial = (variant = "standard") => makeFen(defaultPosition(rules(variant)).toSetup());

export const fen = (pos) => makeFen(pos.toSetup());

// EPD: the first four FEN fields. two positions with the same EPD are the same position for
// every purpose but the fifty-move and move-number clocks.
export const epd = (input) => input.split(" ").slice(0, 4).join(" ");

// sha256 over a string, first 64 bits as hex — the slug grammar every corpus row uses.
export const digest = async (text) => {
  const bytes = new TextEncoder().encode(text);
  const hashed = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashed).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

// the position key: the digest of the normalised EPD. deterministic across implementations
// because EPD is standard; wide enough that a corpus of every position lichess has evaluated
// does not collide.
export const key = (input) => digest(epd(fen(position(input))));

const move = (pos, uci) => {
  const parsed = parseUci(uci);
  if (!parsed) throw new Error(`[rules] "${uci}" is not a UCI move`);
  if (!pos.isLegal(parsed)) throw new Error(`[rules] ${uci} is not legal in ${fen(pos)}`);
  return parsed;
};

const outcome = (pos) => {
  const result = pos.outcome();
  if (!result) return null;
  return { winner: result.winner ?? null, result: result.winner === "white" ? "1-0" : result.winner === "black" ? "0-1" : "1/2-1/2" };
};

const state = (pos) => ({
  turn: pos.turn,
  check: pos.isCheck(),
  checkmate: pos.isCheckmate(),
  stalemate: pos.isStalemate(),
  insufficient: pos.isInsufficientMaterial(),
  end: pos.isEnd(),
  outcome: outcome(pos),
});

// every legal move, as UCI + SAN, plus chessground's dests map and the position's state.
export const legal = ({ fen: input = START, variant = "standard" } = {}) => {
  const pos = position(input, variant);
  const moves = [];
  for (const [from, targets] of pos.allDests()) {
    for (const to of targets) {
      const base = { from, to };
      const piece = pos.board.get(from);
      const promotes = piece?.role === "pawn" && (to >= 56 || to < 8);
      const candidates = promotes ? ["queen", "rook", "bishop", "knight"].map((promotion) => ({ ...base, promotion })) : [base];
      for (const candidate of candidates) moves.push({ uci: makeUci(candidate), san: makeSan(pos, candidate) });
    }
  }
  const dests = {};
  for (const [from, targets] of chessgroundDests(pos)) dests[from] = targets;
  return { fen: fen(pos), moves, dests, ...state(pos) };
};

// one move. returns the position after it and what the move was.
export const apply = ({ fen: input = START, uci, variant = "standard" }) => {
  const pos = position(input, variant);
  const parsed = move(pos, uci);
  const captured = pos.board.get(parsed.to) ?? null;
  const before = { turn: pos.turn, fullmoves: pos.fullmoves };
  const san = makeSanAndPlay(pos, parsed);
  return {
    fen: fen(pos),
    uci: makeUci(parsed),
    san,
    capture: captured ? captured.role : null,
    promotion: parsed.promotion ?? null,
    ply: (before.fullmoves - 1) * 2 + (before.turn === "white" ? 1 : 2),
    ...state(pos),
  };
};

// SAN → UCI in a position.
export const parse = ({ fen: input = START, san, variant = "standard" }) => {
  const pos = position(input, variant);
  const parsed = parseSan(pos, san);
  if (!parsed) throw new Error(`[rules] "${san}" is not a legal move in ${fen(pos)}`);
  return { uci: makeUci(parsed), san: makeSan(pos, parsed) };
};

// a line of UCI moves from a position: every ply with its FEN, and where it ends.
export const replay = ({ fen: input = START, moves = [], variant = "standard" } = {}) => {
  const pos = position(input, variant);
  const plies = [];
  for (const uci of moves) {
    const parsed = move(pos, uci);
    const san = makeSanAndPlay(pos, parsed);
    plies.push({ uci: makeUci(parsed), san, fen: fen(pos), ply: plies.length + 1 });
  }
  return { fen: fen(pos), plies, sans: plies.map((ply) => ply.san), ...state(pos) };
};

const tagsOf = (headers) => Object.fromEntries(headers);

// PGN in: tags + the MAIN LINE as UCI (variations are kept in the text, not walked here); out:
// tags + the main line, with abandoned lines written as RAVs (§8.2.5) at the ply they left from.
export const pgn = {
  parse: (text) => {
    const games = parsePgn(text);
    if (!games.length) throw new Error("[rules] no game in the PGN text");
    return games.map((game) => {
      const tags = tagsOf(game.headers);
      const start = startingPosition(game.headers).unwrap(
        (value) => value,
        (error) => {
          throw new Error(`[rules] PGN starting position — ${error.message}`);
        },
      );
      const pos = start.clone();
      const moves = [];
      const warnings = [];
      let node = game.moves;
      while (node.children.length) {
        const child = node.children[0];
        const parsed = parseSan(pos, child.data.san);
        if (!parsed) {
          warnings.push(`stopped at "${child.data.san}" — not legal in ${fen(pos)}`);
          break;
        }
        moves.push(makeUci(parsed));
        pos.play(parsed);
        node = child;
      }
      return { tags, initial: fen(start), moves, plies: moves.length, warnings, comments: game.comments ?? [] };
    });
  },

  // PGN out from tags + UCI moves. SAN is derived, so a bad move is a sentence, not bad text.
  // `variations` are lines the game left behind — { ply, moves } — and each is written as a RAV
  // sibling at the node its first move leaves from. A line that is not legal there is DROPPED,
  // named in `warnings`: a sealed record is never worth a throw.
  make: ({ tags = {}, moves = [], initial = START, variant = "standard", variations = [] }) => {
    const game = defaultGame(() => new Map(Object.entries(tags)));
    if (initial !== START) game.headers.set("FEN", initial);
    const pos = position(initial, variant);
    // every node of the main line by the number of plies behind it, so a RAV can find its fork
    const nodes = [game.moves];
    const fens = [fen(pos)];
    let node = game.moves;
    for (const uci of moves) {
      const parsed = move(pos, uci);
      const san = makeSanAndPlay(pos, parsed);
      const child = { data: { san }, children: [] };
      node.children.push(child);
      node = child;
      nodes.push(child);
      fens.push(fen(pos));
    }
    const warnings = [];
    for (const line of variations) {
      const fork = nodes[line.ply - 1];
      if (!fork) {
        warnings.push(`variation at ply ${line.ply} has no such ply in a ${moves.length}-ply game`);
        continue;
      }
      const side = position(fens[line.ply - 1], variant);
      const chain = [];
      try {
        for (const uci of line.moves) {
          const parsed = move(side, uci);
          chain.push({ data: { san: makeSanAndPlay(side, parsed) }, children: [] });
        }
      } catch (error) {
        warnings.push(`variation at ply ${line.ply} — ${error.message}`);
        continue;
      }
      if (!chain.length) continue;
      chain.forEach((link, index) => index && chain[index - 1].children.push(link));
      fork.children.push(chain[0]);
    }
    return { text: makePgn(game), warnings };
  },
};

const LETTERS = { king: "K", queen: "Q", rook: "R", bishop: "B", knight: "N", pawn: "P" };
const ORDER = ["king", "queen", "rook", "bishop", "knight", "pawn"];

// material on the board, the way tablebases name it: "KRPvKR".
export const material = (input = START) => {
  const pos = position(input);
  const side = (color) =>
    ORDER.map((role) => LETTERS[role].repeat(pos.board.pieces(color, role).size())).join("");
  const white = side("white");
  const black = side("black");
  return { pieces: pos.board.occupied.size(), white, black, material: `${white}v${black}` };
};

// a coarse phase — enough to stamp a symbol, never a judgement.
export const phase = (input = START) => {
  const { pieces } = material(input);
  const pos = position(input);
  const majors = ["queen", "rook"].reduce(
    (count, role) => count + pos.board.pieces("white", role).size() + pos.board.pieces("black", role).size(),
    0,
  );
  if (pieces <= 10 || majors <= 2) return "endgame";
  const developed = pos.fullmoves > 10;
  return developed ? "middlegame" : "opening";
};

export const square = (index) => makeSquare(index);

// the rules-side check the aperture and the match loop share: is this UCI legal here?
export const isLegal = ({ fen: input = START, uci, variant = "standard" }) => {
  try {
    move(position(input, variant), uci);
    return true;
  } catch {
    return false;
  }
};

export const chess = Chess;
