import { Aperture, contexts, Path, shard, sleep, specimen, steer, traits } from "@vivalence/typology";
import { gestalten, lifecycle, LiteralEntity, NoteEntity, UserEntity } from "@vivalence/runtime";
import { lighthouse } from "@vivalence/runtime/scenarios";
import * as domain from "../chess.viva.js";
import * as rules from "../rules/index.js";

const { describe, it, expect, beforeAll, afterAll } = specimen;

const E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const SCHOLAR = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

describe("chess e4 beside italian casa — two daemons on one datamap, each row through its own repository", { sanitizeResources: false, sanitizeOps: false }, () => {
  let scenario;
  let within;
  let user;
  const daemons = {};
  const modes = {};

  beforeAll(async () => {
    scenario = await lighthouse.create();
    for (const [slug, held] of [["chess", domain], ["italian", {}]]) {
      await scenario.seedDaemon(slug);
      const die = { runtime: scenario.runtime, daemon: { slug, reference: new Path(`/daemon/${slug}`), domain: held, aperture: new Aperture() }, register: { modes: [] } };
      await lifecycle.daemon.population.datamap(die, async () => {});
      await lifecycle.daemon.resolution.domain(die, async () => {});
      daemons[slug] = die.daemon;
    }
    await scenario.datamap.shard.scope(async () => {
      within = scenario.datamap.shard.carry();
    });
    await within(async () => {
      const em = scenario.datamap.entities.em;
      user = em.create(UserEntity, { slug: "beef" });
      await em.flush();
      em.setFilterParams("user", { user: user.id });
      for (const slug of ["chess", "italian"]) {
        const { entities } = daemons[slug];
        modes[slug] = Object.fromEntries(["position", "puzzle"].map((kind) => [kind, entities.mode.create({ type: "topology", slug: kind })]));
        entities.symbol.create({ slug: "position", mode: modes[slug].position, traits: ["TOPOGRAPHICAL"] });
      }
      await em.flush();
    });
  });

  afterAll(async () => await scenario.close());

  it("P-reach: e4 is reached through chess's repository, owned by chess's own position topology", () =>
    within(async () => {
      const e4 = await daemons.chess.entities.literal.reach(E4);
      expect(e4.slug).toBe(await rules.key(rules.fen(rules.position(E4))));
      expect(e4.daemon.slug).toBe("chess");
      expect(e4.mode.id).toBe(modes.chess.position.id);
      expect(e4.mode.id).not.toBe(modes.italian.position.id);
      expect(e4.symbols.getItems().map((symbol) => symbol.daemon.slug)).toEqual(["chess"]);
    }));

  it("P-casa: casa exists once per daemon — italian's and chess's, two rows, each repository sees its own", () =>
    within(async () => {
      daemons.italian.entities.literal.create({ slug: "casa", mode: modes.italian.position });
      daemons.chess.entities.literal.create({ slug: "casa", mode: modes.chess.position });
      await scenario.datamap.entities.em.flush();
      for (const slug of ["chess", "italian"]) {
        const rows = await daemons[slug].entities.literal.find({ slug: "casa" });
        expect(rows.map((row) => row.daemon.slug)).toEqual([slug]);
      }
      expect(await scenario.datamap.entities.em.count(LiteralEntity, { slug: "casa" })).toBe(2);
      expect((await daemons.italian.entities.literal.find({})).map((row) => row.slug)).toEqual(["casa"]);
    }));

  it("P-verbs: chess's trait verbs live on chess's repository only", () => {
    expect(daemons.chess.minted.literal.repository.name).toBe("ChessLiteralRepository");
    for (const verb of ["reach", "seal", "pose", "puzzle", "classify", "record", "ladder", "analysed"]) {
      expect(typeof daemons.chess.entities.literal[verb]).toBe("function");
      expect(daemons.italian.entities.literal[verb]).toBeUndefined();
    }
  });

  it("P-collide: a mode trait naming a chess verb is a boot fault", () => {
    const SHADOW = traits.define("SHADOW", { repository: { reach() {} } });
    expect(() => gestalten.belt.gather(domain, [{ traits: { literal: [SHADOW] } }], "literal")).toThrow("trait SHADOW.repository.reach collides with PLACED.repository.reach");
  });

  it("P-trace: an attempt writes a TRACED note through chess's note repository", () =>
    within(async () => {
      const posed = await daemons.chess.entities.literal.pose({ id: "scholar", fen: SCHOLAR, solution: ["h5f7"], rating: 600, themes: [] });
      const attempt = (moves) =>
        steer.dispatch.invoke(domain.aperture, "/puzzle/attempt", steer.strategy.direct)({ ...shard.context.lift(contexts.host, daemons.chess), user, mode: null, thread: null, input: { puzzle: posed.id, moves } });
      expect((await attempt(["h5h7"])).status).toBe("FAILED");
      expect((await attempt(["h5f7"])).status).toBe("SOLVED");
      await sleep.ms(20);
      const traced = await daemons.chess.entities.note.find({ traits: "TRACED" });
      expect(traced.map((note) => note.trait.TRACED.status).sort()).toEqual(["FAILED", "SOLVED"]);
      expect(traced.every((note) => note.daemon.slug === "chess" && note.literal.id === posed.id)).toBe(true);
      expect(await daemons.italian.entities.note.find({ traits: "TRACED" })).toEqual([]);
      expect(await scenario.datamap.entities.em.count(NoteEntity, {})).toBe(2);
    }));
});
