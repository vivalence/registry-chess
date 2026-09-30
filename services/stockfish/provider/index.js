import { Engine } from "./uci.js";

// the engine contract every chess surface calls:
//
//   analyse({ fen, depth?, movetime?, multipv? })  → AsyncIterable<{ kind: "info", depth, multipv, cp?, mate?, pv } | { kind: "bestmove", uci, ponder }>
//   evaluate({ fen, depth?, movetime?, multipv? }) → { engine, depth, multipv: [{ cp?, mate?, pv }], bestmove }
//   play({ fen, elo?, movetime?, depth? })         → { uci, ponder }
//   stop() · close()
//
// scores are from the side to move's view, as UCI gives them. `analyse` is an async generator on
// purpose: on this transport a generator IS SSE, and a deep search does not fit under the
// daemon-call ceiling otherwise.
export function provider(service) {
  const statics = service.statics ?? {};
  const engine = new Engine({
    binary: statics.binary ?? "stockfish",
    args: statics.args ?? [],
    options: { Threads: statics.threads ?? 2, Hash: statics.hash ?? 128, ...(statics.syzygy ? { SyzygyPath: statics.syzygy } : {}) },
  });

  const fold = (records) => {
    const lines = new Map();
    let depth = 0;
    let bestmove = null;
    for (const record of records) {
      if (record.kind === "bestmove") bestmove = record.uci;
      else if (record.pv?.length && !record.bound) {
        depth = Math.max(depth, record.depth ?? 0);
        lines.set(record.multipv ?? 1, record);
      }
    }
    const multipv = [...lines.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, line]) => ({ ...(line.cp != null ? { cp: line.cp } : {}), ...(line.mate != null ? { mate: line.mate } : {}), pv: line.pv }));
    return { engine: engine.name ?? statics.binary ?? "stockfish", depth, multipv, bestmove };
  };

  const analyse = ({ fen, depth = 16, movetime, multipv = 1 }) => {
    // the queue grants the engine to this search and holds it until the caller has drained
    let grant, release;
    const granted = new Promise((resolve) => (grant = resolve));
    const held = new Promise((resolve) => (release = resolve));
    const turn = engine.run(async () => {
      grant();
      await held;
    });
    return (async function* () {
      await Promise.race([granted, turn]);
      try {
        for await (const record of engine.search({ fen, depth, movetime, multipv })) yield record;
      } finally {
        release();
      }
    })();
  };

  return {
    analyse,

    evaluate: async ({ fen, depth = 16, movetime, multipv = 1 }) => {
      const records = [];
      await engine.run(async () => {
        for await (const record of engine.search({ fen, depth, movetime, multipv })) records.push(record);
      });
      return fold(records);
    },

    play: async ({ fen, elo, movetime = 500, depth }) => {
      let bestmove = null;
      await engine.run(async () => {
        const options = elo ? { UCI_LimitStrength: true, UCI_Elo: Math.max(1320, Math.min(3190, elo)) } : { UCI_LimitStrength: false };
        for await (const record of engine.search({ fen, depth, movetime: depth ? undefined : movetime, multipv: 1, options })) {
          if (record.kind === "bestmove") bestmove = record;
        }
      });
      return { uci: bestmove.uci, ponder: bestmove.ponder };
    },

    stop: () => engine.stop(),
    close: () => engine.close(),
    // what the status door shows — never spawns the process
    about: () => ({
      binary: engine.binary,
      threads: engine.options.Threads,
      hash: engine.options.Hash,
      started: engine.started,
      ...(engine.name && { engine: engine.name }),
    }),
    get name() {
      return engine.name;
    },
  };
}
