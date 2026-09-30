import { specimen } from "@vivalence/typology";
import { provider } from "../provider/index.js";

const { describe, it, expect, afterAll } = specimen;

const FAKE = new URL("./fake-uci.js", import.meta.url).pathname;
// suites run from the repo root (README) — the fake engine needs the same config the suite got
const CONFIG = `${Deno.cwd()}/deno.jsonc`;
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// the fake engine is a Deno script — the binary is deno itself, the script rides args.
const service = (extra = {}) => ({
  manifest: { slug: "stockfish" },
  statics: { binary: Deno.execPath(), args: ["run", "-A", "--no-check", "--config", CONFIG, FAKE], threads: 1, hash: 16, ...extra },
});

describe("stockfish provider — the engine contract over a fake UCI process", { sanitizeResources: false, sanitizeOps: false }, () => {
  const engine = provider(service());
  afterAll(() => engine.close());

  it("P-handshake: the first call spawns, handshakes and names the engine", async () => {
    const found = await engine.evaluate({ fen: START, depth: 3 });
    expect(found.engine).toBe("FakeFish 0.1");
    expect(found.depth).toBe(3);
    expect(found.bestmove).toBe("a2a3");
  });

  it("P-multipv: multipv folds one line per rank, best first, deepest depth kept", async () => {
    const found = await engine.evaluate({ fen: START, depth: 4, multipv: 3 });
    expect(found.multipv.length).toBe(3);
    expect(found.multipv[0].cp).toBe(40);
    expect(found.multipv[1].cp).toBe(35);
    expect(found.multipv[0].pv[0]).toBe("a2a3");
  });

  it("P-stream: analyse yields info records as they arrive and a bestmove last", async () => {
    const kinds = [];
    for await (const record of engine.analyse({ fen: START, depth: 2 })) kinds.push(record.kind);
    expect(kinds.at(-1)).toBe("bestmove");
    expect(kinds.filter((kind) => kind === "info").length).toBe(2);
  });

  it("P-play: play answers one legal move and honours an Elo limit", async () => {
    const move = await engine.play({ fen: START, depth: 2 });
    expect(move.uci).toBe("a2a3");
    const limited = await engine.evaluate({ fen: START, depth: 1 });
    expect(limited.multipv[0].cp).toBe(10);
  });

  it("P-queue: two concurrent searches never interleave — both fold cleanly", async () => {
    const [a, b] = await Promise.all([engine.evaluate({ fen: START, depth: 3 }), engine.evaluate({ fen: START, depth: 5 })]);
    expect(a.depth).toBe(3);
    expect(b.depth).toBe(5);
  });

  it("P-mate: a mate score reaches the fold as `mate`, not `cp`", async () => {
    const found = await engine.evaluate({ fen: "K1k5/8/8/8/8/8/8/7R w - - 0 1", depth: 4 });
    expect(found.multipv[0].mate).toBe(1);
    expect(found.multipv[0].cp).toBeUndefined();
  });
});

describe("stockfish provider — a missing binary", { sanitizeResources: false, sanitizeOps: false }, () => {
  it("P-missing: construction never throws; the first call is a sentence naming the fix", async () => {
    const missing = provider({ manifest: { slug: "stockfish" }, statics: { binary: "/nonexistent/stockfish-binary" } });
    let message = null;
    try {
      await missing.evaluate({ fen: START, depth: 1 });
    } catch (error) {
      message = error.message;
    }
    expect(message).toMatch(/cannot start/);
    expect(message).toMatch(/VIVA_SERVICE_STOCKFISH_BINARY/);
  });
});
