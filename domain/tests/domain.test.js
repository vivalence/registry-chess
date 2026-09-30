import { specimen, shape } from "@vivalence/typology";
import * as domain from "../chess.viva.js";
import { engine, mount, SYMBOLS } from "../../tests/rig.js";
import { START } from "../rules/index.js";

const { describe, it, expect, beforeAll, afterAll } = specimen;

describe("domain module — what the runtime mounts", () => {
  it("P-manifest: an EXPOSED, TOOLING domain named chess", () => {
    expect(domain.manifest.type).toBe("domain");
    expect(domain.manifest.slug).toBe("chess");
    expect([...domain.manifest.traits].sort()).toEqual(["EXPOSED", "TOOLING"]);
  });

  it("P-entities: literal · symbol · trace, each a {type, schema, entity} tier keyed by type", () => {
    expect(Object.keys(domain.entities).sort()).toEqual(["literal", "symbol", "trace"]);
    for (const [key, tier] of Object.entries(domain.entities)) {
      expect(tier.type).toBe(key);
      expect(typeof tier.entity).toBe("function");
    }
  });

  it("P-doors: the aperture opens the seven doors and the tools arm five names", () => {
    const routes = Object.keys(shape.strip(domain.aperture).branches ?? {}).sort();
    expect(routes).toEqual(["analysis", "engine", "game", "opening", "position", "puzzle", "rules"]);
    const armed = Object.keys(shape.strip(domain.tools).branches ?? {}).sort();
    expect(armed).toEqual(["assess", "classify", "elo", "legal", "puzzle"]);
  });

  it("P-one-root: every topology declares exactly ONE TOPOGRAPHICAL symbol, named after itself", () => {
    for (const [name, rows] of Object.entries(SYMBOLS)) {
      const roots = rows.filter((row) => row.traits.includes("TOPOGRAPHICAL"));
      expect(roots.map((row) => row.slug)).toEqual([name]);
      expect(new Set(rows.map((row) => row.slug)).size).toBe(rows.length);
    }
  });

  it("P-example-in-desc: every schema description in types.js ends with an Example", () => {
    const walk = (schema, path, seen = new Set()) => {
      if (!schema || typeof schema !== "object" || seen.has(schema)) return;
      seen.add(schema);
      if (typeof schema.description === "string" && schema.description.length > 40) {
        expect(schema.description, `${path}: ${schema.description}`).toMatch(/Example:/);
      }
      for (const [key, child] of Object.entries(schema.properties ?? {})) walk(child, `${path}.${key}`, seen);
      for (const [index, child] of (schema.anyOf ?? []).entries()) walk(child, `${path}[${index}]`, seen);
      if (schema.items) walk(schema.items, `${path}[]`, seen);
    };
    for (const name of ["OCCUPANT", "SEATS", "CLOCK", "EVALUATION", "PROGRESS", "JUDGEMENT", "RUNG", "LADDER", "STATUS"]) walk(domain.schematics[name], name);
  });
});

describe("domain rig — positions, games, openings, puzzles over a real datamap", { sanitizeResources: false, sanitizeOps: false }, () => {
  let rig;
  let scripted;

  beforeAll(async () => {
    scripted = engine({
      lines: {
        [START]: [{ cp: 30, pv: ["e2e4", "e7e5"] }, { cp: 25, pv: ["d2d4", "d7d5"] }, { cp: 10, pv: ["g1f3"] }],
      },
      // the ladder: weak searches push a pawn, club searches play e4, strong ones d4
      plays: { [START]: { 1320: "a2a3", 1600: ["e2e4", "e2e4", "d2d4", "e2e4", "d2d4"], 2000: ["e2e4", "e2e4", "e2e4", "c2c4", "e2e4"], 2400: ["d2d4", "e2e4", "d2d4", "d2d4", "d2d4"], 2800: "d2d4", full: "d2d4" } },
    });
    rig = await mount({ engine: scripted });
  });

  afterAll(async () => rig?.close());

  it("P-one-position-row: reaching the same position twice, by two routes, is ONE owned row", async () => {
    const a = await rig.entities.literal.reach("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2");
    const b = await rig.entities.literal.reach("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 7 30");
    expect(a.id).toBe(b.id);
    expect(a.ontology).toBe("position");
    expect(a.mode.id).toBe(rig.modes.position.id);
    expect(a.trait.PLACED.epd).toBe("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -");
    const rows = await rig.entities.literal.count({ slug: a.slug });
    expect(rows).toBe(1);
  });

  it("P-null-owner: a position cannot be minted when no topology owns positions", async () => {
    const owner = await rig.em.findOne(rig.modes.position.constructor, { id: rig.modes.position.id });
    owner.slug = "position-hidden";
    await rig.em.flush();
    let message = null;
    try {
      await rig.entities.literal.reach("8/8/8/8/8/8/8/K6k w - - 0 1");
    } catch (error) {
      message = error.message;
    }
    owner.slug = "position";
    await rig.em.flush();
    expect(message).toMatch(/kernel mounts no @chess\/topology\/position/);
  });

  it("P-eval-cache: a miss calls the engine once, a hit calls it zero times, a deeper ask misses again", async () => {
    const first = await rig.call("/position/eval", { fen: START, depth: 12, multipv: 2 });
    expect(first.cached).toBe(false);
    expect(first.evaluation.multipv.length).toBe(2);
    expect(scripted.calls.filter((call) => call.kind === "evaluate").length).toBe(1);
    const second = await rig.call("/position/eval", { fen: START, depth: 12, multipv: 2 });
    expect(second.cached).toBe(true);
    expect(scripted.calls.filter((call) => call.kind === "evaluate").length).toBe(1);
    const deeper = await rig.call("/position/eval", { fen: START, depth: 20 });
    expect(deeper.cached).toBe(false);
    expect(scripted.calls.filter((call) => call.kind === "evaluate").length).toBe(2);
    const row = await rig.entities.literal.findOne({ slug: first.key });
    expect(row.traits).toContain("EVALUATED");
    expect(row.trait.EVALUATED.length).toBe(2);
  });

  it("P-transposition: the same position by a different move order is a cache hit", async () => {
    const a = await rig.call("/position/eval", { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", depth: 8 });
    const before = scripted.calls.length;
    const b = await rig.call("/position/eval", { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 3 9", depth: 8 });
    expect(b.cached).toBe(true);
    expect(a.key).toBe(b.key);
    expect(scripted.calls.length).toBe(before);
  });

  it("P-engine-status: the status door names the consumed engine without spawning it", async () => {
    const status = await rig.call("/engine/status", {});
    expect(status.present).toBe(true);
    expect(status.engine).toBe("ScriptedFish");
    expect(status.threads).toBe(1);
    expect(status.message).toBeUndefined();
  });

  it("P-elo-ladder: every rung is searched five times and cached; the elo of a move is the highest strength that still picks it half the time", async () => {
    const plays = () => scripted.calls.filter((call) => call.kind === "play").length;
    const before = plays();
    const e4 = await rig.call("/position/elo", { fen: START, uci: "e2e4" });
    expect(plays() - before).toBe(30);
    expect(e4.samples).toBe(5);
    expect(e4.rungs.map((rung) => `${rung.elo}:${rung.san}:${rung.share}`)).toEqual(["1320:a3:0", "1600:e4:0.6", "2000:e4:0.8", "2400:d4:0.2", "2800:d4:0", "full:d4:0"]);
    expect(e4.elo).toBe(2000);
    expect(e4.spread).toBe(2400);
    expect(e4.settled).toBe(true);
    expect(e4.switches).toEqual({ elo: 2400, uci: "d2d4", san: "d4" });
    expect(e4.best).toEqual({ uci: "d2d4", san: "d4" });
    expect(e4.hits).toBe(0);
    expect(e4.verdict).toBe("a club player's move");
    expect(e4.sentence).toBe("Stockfish limited to 2000 still picks e4 in 4 of 5 searches; at 2400 it switches to d4.");
    const d4 = await rig.call("/position/elo", { fen: START, uci: "d2d4" });
    expect(plays() - before).toBe(30);
    expect(d4.hits).toBe(6);
    expect(d4.rungs.map((rung) => rung.share)).toEqual([0, 0.4, 0, 0.8, 1, 1]);
    expect(d4.elo).toBe("full");
    expect(d4.unanimous).toBe(false);
    expect(d4.sentence).toBe("Stockfish at full strength plays d4; limited to 1320, 1600, 2000 it prefers e4.");
    const never = await rig.call("/position/elo", { fen: START, uci: "g1f3" });
    expect(never.elo).toBe(null);
    expect(never.spread).toBe(null);
    expect(never.verdict).toBe("a move no strength plays");
    const once = await rig.call("/position/elo", { fen: START, uci: "c2c4" });
    expect(once.elo).toBe(null);
    expect(once.spread).toBe(2000);
    expect(once.verdict).toBe("one of several equal moves");
    expect(once.sentence).toBe("No strength prefers c4 — Stockfish limited to 2000 reaches for it in 1 of 5 searches among e4; at full strength it plays d4.");
    const row = await rig.entities.literal.findOne({ slug: e4.key });
    expect(row.traits).toContain("LADDERED");
    expect(Object.keys(row.trait.LADDERED).sort()).toEqual(["1320", "1600", "2000", "2400", "2800", "full"]);
    expect(row.trait.LADDERED["1600"].plays).toEqual(["e2e4", "e2e4", "d2d4", "e2e4", "d2d4"]);
    expect(row.trait.LADDERED["1600"].movetime).toBe(100);
    // more samples asked: only the missing searches run, the cache grows, the share moves
    const more = await rig.call("/position/elo", { fen: START, uci: "e2e4", samples: 7 });
    expect(plays() - before).toBe(42);
    expect(more.hits).toBe(0);
    expect(more.rungs[1].plays.length).toBe(7);
    expect(Math.round(more.rungs[1].share * 7)).toBe(5);
    expect(more.rungs[3].plays).toEqual(["d2d4", "e2e4", "d2d4", "d2d4", "d2d4", "d2d4", "e2e4"]);
    const tool = await rig.invoke("/elo", { fen: START, uci: "e2e4" });
    expect(tool.message).toMatch(/^e4 — a club player's move\. Stockfish limited to 2000 still picks e4 in 6 of 7 searches; at 2400 it switches to d4\./);
    expect(tool.message).toMatch(/1320: a3 · 1600: e4 5\/7 ✓ · 2000: e4 6\/7 ✓ · 2400: d4 \(e4 2\/7\) · 2800: d4 · full: d4$/);
    const split = await rig.call("/position/elo", { fen: START, uci: "d2d4" });
    expect(split.sentence).toBe("Stockfish at full strength plays d4; limited to 1320, 1600, 2000 it prefers e4.");
    let refused = null;
    try {
      await rig.call("/position/elo", { fen: START, uci: "e2e5" });
    } catch (error) {
      refused = error.message;
    }
    expect(refused).toMatch(/e2e5 is not legal here/);
  });

  it("P-seal: a sealed game is a literal wearing game · result · termination symbols", async () => {
    const row = await rig.entities.literal.seal({
      tags: { White: "Scholar", Black: "Victim" },
      moves: ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"],
      seats: { white: { kind: "user" }, black: { kind: "engine", elo: 1320 } },
    });
    expect(row.ontology).toBe("game");
    expect(row.trait.TERMINATED).toEqual({ result: "1-0", reason: "checkmate" });
    expect(row.trait.RECORDED.plies).toBe(7);
    expect(row.trait.RECORDED.pgn).toContain("Qxf7#");
    const worn = (await rig.entities.literal.findOne({ id: row.id }, { populate: ["symbols"] })).symbols.getItems().map((symbol) => symbol.slug).sort();
    expect(worn).toEqual(["game", "game.result.white", "game.termination.checkmate", "game.variant.standard"]);
  });

  it("P-reimport: importing the same PGN twice yields one row and says the second was held", async () => {
    const pgn = '[Event "Test"]\n[White "A"]\n[Black "B"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
    const first = await rig.call("/game/import", { pgn, source: { provider: "test", id: "fools" } });
    expect(first.imported).toBe(1);
    expect(first.held).toBe(0);
    const second = await rig.call("/game/import", { pgn });
    expect(second.imported).toBe(0);
    expect(second.held).toBe(1);
    expect(second.games[0].id).toBe(first.games[0].id);
    const listed = await rig.call("/game/list", { symbols: ["game.result.black"] });
    expect(listed.map((row) => row.id)).toContain(first.games[0].id);
    const exported = await rig.call("/game/export", { game: first.games[0].id });
    expect(exported.pgn).toContain("Qh4#");
  });

  it("P-classify: the deepest catalogued position names the opening; nothing catalogued is null", async () => {
    const owner = rig.modes.opening;
    const symbol = await rig.entities.symbol.findOne({ slug: "opening" });
    const catalogue = async (eco, name, moves) => {
      const line = domain.aperture; // rules through the door below
      const replayed = await rig.call("/rules/replay", { moves });
      const row = rig.entities.literal.create({
        slug: `${eco.toLowerCase()}-${name.toLowerCase().replace(/\W+/g, "-")}`,
        traits: ["CATALOGUED"],
        trait: { CATALOGUED: { eco, name, moves, pgn: replayed.sans.join(" "), epd: replayed.fen.split(" ").slice(0, 4).join(" ") } },
        mode: owner,
      });
      row.symbols.add(symbol);
      await rig.em.flush();
      return line && row;
    };
    await catalogue("C20", "King's Pawn Game", ["e2e4", "e7e5"]);
    await catalogue("C60", "Ruy Lopez", ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"]);
    const named = await rig.call("/opening/classify", { moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"] });
    expect(named.eco).toBe("C60");
    expect(named.lastBookPly).toBe(5);
    const shallow = await rig.call("/opening/classify", { moves: ["e2e4", "e7e5", "d2d3"] });
    expect(shallow.eco).toBe("C20");
    const none = await rig.call("/opening/classify", { moves: ["a2a3"] });
    expect(none.eco).toBe(null);
  });

  it("P-analysis: a game streams one progress record per position and ends with a report", async () => {
    const records = await rig.drain("/analysis/game", { moves: ["e2e4", "e7e5", "g1f3"], depth: 6 });
    expect(records.length).toBe(5);
    expect(records.slice(0, 4).every((record) => record.stage === "eval")).toBe(true);
    const last = records.at(-1);
    expect(last.stage).toBe("report");
    expect(last.report.judgements.length).toBe(3);
    expect(last.report.judgements[0].uci).toBe("e2e4");
    expect(last.report.accuracy.white).toBeGreaterThan(0);
  });

  it("P-no-engine: without an engine, eval says what to install and analysis stops with one record", async () => {
    const services = rig.daemon.services;
    rig.daemon.services = {};
    try {
      const found = await rig.call("/position/eval", { fen: "8/8/8/8/8/4k3/8/4K2R w K - 0 1" });
      expect(found.evaluation).toBe(null);
      expect(found.message).toMatch(/consume\.engine/);
      const records = await rig.drain("/analysis/game", { moves: ["a2a3"] });
      expect(records.length).toBe(1);
      expect(records[0].stage).toBe("engine");
      const tool = await rig.invoke("/assess", { fen: "8/8/8/8/8/4k3/8/4K2R w K - 0 1" });
      expect(tool.condition).toBe("ERROR");
      const status = await rig.call("/engine/status", {});
      expect(status.present).toBe(false);
      expect(status.message).toMatch(/VIVA_SERVICE_STOCKFISH_BINARY/);
      const ladder = await rig.call("/position/elo", { fen: "8/8/8/8/8/4k3/8/4K2R w K - 0 1", uci: "h1h8" });
      expect(ladder.rungs).toBe(null);
      expect(ladder.message).toMatch(/consume\.engine/);
      const elo = await rig.invoke("/elo", { fen: "8/8/8/8/8/4k3/8/4K2R w K - 0 1", uci: "h1h8" });
      expect(elo.condition).toBe("ERROR");
    } finally {
      rig.daemon.services = services;
    }
  });

  it("P-puzzle: a posed riddle is picked by level, never with its solution; an attempt writes a trace", async () => {
    await rig.entities.literal.pose({ id: "scholar", fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", solution: ["h5f7"], rating: 600, themes: ["mate-in-1", "attacking-f2-f7"] });
    await rig.entities.literal.pose({ id: "fools", fen: "rnbqkbnr/pppp1ppp/8/4p3/5PP1/8/PPPPP2P/RNBQKBNR b KQkq g3 0 2", solution: ["d8h4"], rating: 1500, themes: ["mate-in-1"] });
    const novice = await rig.call("/puzzle/next", { level: "novice" });
    expect(novice.slug).toBe("puzzle-scholar");
    expect(novice.solution).toBeUndefined();
    expect(novice.side).toBe("w");
    const club = await rig.invoke("/puzzle", { level: "club" });
    expect(club.level).toBe("club");
    const wrong = await rig.call("/puzzle/attempt", { puzzle: novice.id, moves: ["h5h7"] });
    expect(wrong.status).toBe("FAILED");
    expect(wrong.expected).toBe("h5f7");
    const right = await rig.call("/puzzle/attempt", { puzzle: novice.id, moves: ["h5f7"] });
    expect(right.status).toBe("SOLVED");
    // outside a request scope nothing binds the user filter — the rig asks for the rows plainly
    const traces = await rig.entities.trace.find({ user: rig.user.id }, { filters: false });
    expect(traces.map((trace) => trace.status).sort()).toEqual(["FAILED", "SOLVED"]);
    const excluded = await rig.call("/puzzle/next", { level: "novice", exclude: [novice.id] });
    expect(excluded).toBe(null);
  });

  it("P-wire: the rules door answers over inline http exactly as it does in-process", async () => {
    const wire = await rig.conn.call("/rules/legal", { fen: START });
    expect(wire.moves.length).toBe(20);
    expect(wire.turn).toBe("white");
  });

  it("P-tools: chess_legal and chess_classify speak a message the model can read", async () => {
    const legal = await rig.invoke("/legal", { fen: START });
    expect(legal.message).toMatch(/white to move · 20 legal/);
    const walked = await rig.call("/position/lines", { fen: START, multipv: 2, depth: 4, plies: 4 });
    expect(walked.lines.length).toBe(2);
    expect(walked.lines[0]).toMatchObject({ rank: 1, uci: expect.any(Array), san: expect.any(Array) });
    expect(walked.lines[0].san.length).toBeLessThanOrEqual(4);
    const assess = await rig.invoke("/assess", { fen: START, depth: 4, multipv: 2 });
    expect(assess.message).toMatch(/ScriptedFish/);
    expect(assess.message).toMatch(/e4 e5/);
  });
});
