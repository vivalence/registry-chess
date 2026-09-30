import { specimen } from "@vivalence/typology";
import * as rules from "../rules/index.js";

const { describe, it, expect } = specimen;

const SCHOLAR = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const BACKRANK = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";

describe("rules — legal moves", () => {
  it("P-perft1: the start position has 20 legal moves and kiwipete has 48", () => {
    expect(rules.legal({ fen: rules.START }).moves.length).toBe(20);
    expect(rules.legal({ fen: KIWIPETE }).moves.length).toBe(48);
  });

  it("P-dests: chessground dests map every from-square to its targets", () => {
    const { dests } = rules.legal({ fen: rules.START });
    expect(dests.e2.sort()).toEqual(["e3", "e4"]);
    expect(dests.g1.sort()).toEqual(["f3", "h3"]);
    expect(Object.keys(dests).length).toBe(10);
  });

  it("P-promotion: a pawn on the seventh offers four promotions", () => {
    const { moves } = rules.legal({ fen: "8/P6k/8/8/8/8/8/K7 w - - 0 1" });
    expect(moves.map((m) => m.uci).sort()).toEqual(["a1a2", "a1b1", "a1b2", "a7a8b", "a7a8n", "a7a8q", "a7a8r"]);
    expect(moves.find((m) => m.uci === "a7a8q").san).toBe("a8=Q");
  });
});

describe("rules — apply, parse, replay", () => {
  it("P-apply: e2e4 from the start yields the known FEN, SAN e4, ply 1", () => {
    const after = rules.apply({ fen: rules.START, uci: "e2e4" });
    expect(after.fen).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    expect(after.san).toBe("e4");
    expect(after.ply).toBe(1);
    expect(after.check).toBe(false);
  });

  it("P-illegal: an illegal move is a sentence naming the move and the position", () => {
    expect(() => rules.apply({ fen: rules.START, uci: "e2e5" })).toThrow(/e2e5 is not legal/);
    expect(rules.isLegal({ fen: rules.START, uci: "e2e5" })).toBe(false);
    expect(rules.isLegal({ fen: rules.START, uci: "e2e4" })).toBe(true);
  });

  it("P-mate: Qxf7# ends the game 1-0 and the position knows it", () => {
    const after = rules.apply({ fen: SCHOLAR, uci: "h5f7" });
    expect(after.san).toBe("Qxf7#");
    expect(after.checkmate).toBe(true);
    expect(after.outcome).toEqual({ winner: "white", result: "1-0" });
    expect(rules.legal({ fen: after.fen }).moves.length).toBe(0);
  });

  it("P-backrank: Ra8# is mate on the back rank", () => {
    expect(rules.apply({ fen: BACKRANK, uci: "a1a8" }).checkmate).toBe(true);
  });

  it("P-san: SAN round-trips through UCI", () => {
    expect(rules.parse({ fen: rules.START, san: "Nf3" })).toEqual({ uci: "g1f3", san: "Nf3" });
    expect(() => rules.parse({ fen: rules.START, san: "Nf6" })).toThrow(/not a legal move/);
  });

  it("P-replay: a line replays to its FEN with SAN per ply", () => {
    const line = rules.replay({ moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"] });
    expect(line.sans).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    expect(line.fen).toBe("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3");
    expect(line.plies[4].ply).toBe(5);
  });
});

describe("rules — position identity", () => {
  it("P-epd: EPD drops the clocks; the same position after a transposition keys the same", async () => {
    const a = rules.replay({ moves: ["e2e4", "e7e5", "g1f3", "b8c6"] }).fen;
    const b = rules.replay({ moves: ["g1f3", "b8c6", "e2e4", "e7e5"] }).fen;
    expect(rules.epd(a)).toBe(rules.epd(b));
    expect(await rules.key(a)).toBe(await rules.key(b));
    expect((await rules.key(a)).length).toBe(16);
  });

  it("P-key-stable: the start position's key is a fixed 16-hex string", async () => {
    const one = await rules.key(rules.START);
    const two = await rules.key("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5 9");
    expect(one).toBe(two);
    expect(one).toMatch(/^[0-9a-f]{16}$/);
  });

  it("P-material: material reads KRPvKR on a rook ending and 32 pieces at the start", () => {
    expect(rules.material(rules.START).pieces).toBe(32);
    expect(rules.material("8/8/4k3/8/3P4/3K4/8/R6r w - - 0 1").material).toBe("KRPvKR");
    expect(rules.phase("8/8/4k3/8/3P4/3K4/8/R6r w - - 0 1")).toBe("endgame");
    expect(rules.phase(rules.START)).toBe("opening");
  });
});

describe("rules — PGN", () => {
  const TEXT = `[Event "Casual"]
[White "Anderssen"]
[Black "Kieseritzky"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 (4... d5 5. Bxd5) 5. Bxb5 Nf6 1-0`;

  it("P-pgn-parse: tags + the main line as UCI, a variation left in the text", () => {
    const [game] = rules.pgn.parse(TEXT);
    expect(game.tags.White).toBe("Anderssen");
    expect(game.tags.Result).toBe("1-0");
    expect(game.moves).toEqual(["e2e4", "e7e5", "f2f4", "e5f4", "f1c4", "d8h4", "e1f1", "b7b5", "c4b5", "g8f6"]);
    expect(game.plies).toBe(10);
    expect(game.warnings).toEqual([]);
  });

  it("P-pgn-make: UCI moves print as SAN and parse back to the same line", () => {
    const { text } = rules.pgn.make({ tags: { Event: "Test", Result: "*" }, moves: ["e2e4", "c7c5", "g1f3"] });
    expect(text).toContain("1. e4 c5 2. Nf3");
    const [back] = rules.pgn.parse(text);
    expect(back.moves).toEqual(["e2e4", "c7c5", "g1f3"]);
    expect(back.tags.Event).toBe("Test");
  });

  it("P-pgn-illegal: a bad SAN stops the walk with a warning, not a throw", () => {
    const [game] = rules.pgn.parse("1. e4 e5 2. Nf6 *");
    expect(game.moves).toEqual(["e2e4", "e7e5"]);
    expect(game.warnings[0]).toMatch(/Nf6/);
  });
});

describe("rules — variants", () => {
  it("P-variant: unknown variants are a sentence; every declared variant has a start", () => {
    expect(() => rules.position(rules.START, "bughouse")).toThrow(/unknown variant/);
    for (const variant of rules.VARIANTS) expect(rules.initial(variant).split(" ").length).toBeGreaterThanOrEqual(6);
  });
});
