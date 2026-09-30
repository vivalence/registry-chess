// the package's offline rig: a REAL in-memory datamap over the chess entities, the four
// topologies' symbols installed, one mode row per topology (the corpus owners), one user, and
// the domain aperture mounted the way the runtime mounts it — direct in-process calls that
// carry a caller, and an inline http connection for the wire shape.
//
// nothing here needs a daemon, a network or an engine; `engine()` hands out a scripted one.
import { EntitySchema } from "@mikro-orm/core";
import { Aperture, Connection, shape, shard, steer, Url, Vector } from "@vivalence/typology";
import { DataRepository, sets } from "@vivalence/runtime";
import { provider as datamap } from "@vivalence/runtime/scenarios";

import * as domain from "../domain/chess.viva.js";
import * as rules from "../domain/rules/index.js";
import game from "../topologies/game/dataset/symbols/ontological.js";
import position from "../topologies/position/dataset/symbols/ontological.js";
import opening from "../topologies/opening/dataset/symbols/ontological.js";
import puzzle from "../topologies/puzzle/dataset/symbols/ontological.js";

export const TOPOLOGIES = ["game", "position", "opening", "puzzle"];
export const SYMBOLS = { game, position, opening, puzzle };

// population.core's fold, verbatim: override by type, subscribers accumulate, abstract sealed
const collate = (tiers) => {
  const slots = {};
  for (const tier of tiers) {
    for (const descriptor of Object.values(tier)) {
      const slot = (slots[descriptor.type] ??= { type: descriptor.type, subscribers: new Set() });
      slot.entity = descriptor.entity ?? slot.entity;
      slot.schema = descriptor.schema ?? slot.schema;
      slot.repository = descriptor.repository ?? slot.repository;
      if (descriptor.subscriber) slot.subscribers.add(descriptor.subscriber);
    }
  }
  return Object.values(slots);
};

const seal = (slot) =>
  !slot.schema.meta.abstract ? slot : {
    ...slot,
    schema: new EntitySchema({
      class: slot.entity,
      extends: slot.schema,
      name: slot.schema.meta.className,
      tableName: slot.schema.meta.className,
      repository: () => slot.repository ?? DataRepository,
    }),
  };

export async function mount({ engine = null } = {}) {
  const instance = collate([sets.kernel, sets.userspace, sets.transient, domain.entities]).map(seal);
  // classes, not instances — the datamap's config() constructs them
  const subscribers = [...new Set(instance.flatMap((slot) => [...slot.subscribers]))];
  const held = await datamap(instance.map(({ subscribers: _, ...slot }) => slot), subscribers);
  const { entities, orm } = held;
  const em = entities.em;

  // the corpus owners: one mode row per topology, as the runtime's population.modes would mint
  const modes = {};
  for (const slug of TOPOLOGIES) {
    modes[slug] = em.create(sets.kernel.mode.entity, { type: "topology", slug, name: slug, traits: [], installed: "", version: "0.1.0" });
  }
  const user = em.create(sets.kernel.user.entity, { roles: ["USER"], config: {} });
  await em.flush();
  // the buffer and trace filters are the ownership law: a buffer rides a thread, a thread has a
  // user. the runtime binds the params per request; the rig binds them once, globally.
  const thread = em.create(sets.userspace.thread.entity, { user, mode: modes.game, traits: [], trait: {}, counter: 0 });
  await em.flush();
  em.setFilterParams("user", { user: user.id });

  // the topologies' vocabulary, shared and unowned — as DATASET installs a declared source
  for (const rows of Object.values(SYMBOLS)) {
    for (const row of rows) em.create(entities.symbol.getEntityName(), { slug: row.slug, traits: row.traits, trait: row.trait });
  }
  await em.flush();
  em.clear();

  const daemon = {
    manifest: { slug: "chess-rig", traits: [] },
    aperture: new Aperture(),
    twitch: new Vector(),
    entities,
    services: engine ? { engine } : {},
    domain,
    modes: {},
    flatmodes() {
      return Object.values(this.modes).flatMap((type) => Object.values(type));
    },
  };
  daemon.aperture.use(shard.context.bind("daemon", daemon));
  domain.aperture.use(shard.context.bind("daemon", daemon));
  daemon.aperture.slurp(domain.aperture);
  daemon.call = shape.proxy(domain.aperture, steer.strategy.direct);
  domain.resolve(daemon);

  const handler = shape.http(daemon.aperture);
  const conn = new Connection(new Url("http://chess-rig"), shard.transmitter.inline(handler));

  const tools = shape.proxy(domain.tools, steer.strategy.direct);
  const caller = () => ({ daemon, user, mode: { id: modes.game.id }, thread });
  // a direct call — the way a mode reaches a domain verb: the caller's ctx with an input
  const call = (path, input) => steer.dispatch.invoke(domain.aperture, path, steer.strategy.direct)({ ...caller(), input });
  const invoke = (path, input) => tools[path]({ ...caller(), input });
  // drain a yielding verb
  const drain = async (path, input) => {
    const records = [];
    for await (const record of await call(path, input)) records.push(record);
    return records;
  };

  return {
    orm,
    em,
    entities,
    daemon,
    user,
    thread,
    modes,
    conn,
    call,
    invoke,
    drain,
    close: () => orm.close(),
  };
}

// mount a mode module on the rig the way resolution.modes does: a Mode-shaped citizen with its
// row, its App's buffer mint, its aperture bound to daemon + mode, and a harness you script.
// `harness.object.render` is what a hallucinator seat calls; hand it a function of the
// hallucination request and it answers as the model would.
export async function mountMode(rig, module, { harness = null } = {}) {
  const { entities, daemon } = rig;
  const em = entities.em;
  const row = em.create(sets.kernel.mode.entity, {
    type: module.manifest.type,
    slug: module.manifest.slug,
    name: module.manifest.name,
    traits: module.manifest.traits,
    installed: "",
    version: module.manifest.version,
  });
  await em.flush();
  const mode = {
    id: row.id,
    entity: row,
    manifest: module.manifest,
    module,
    aperture: new Vector(),
    tools: new Vector(),
    implements: (trait) => module.manifest.traits.includes(trait),
    harness: {
      object: { render: async (request) => ({ output: { object: await (harness ?? (() => ({})))(request) } }) },
      dialogue: {
        render: async (request) => ({ output: { message: await (harness ?? (() => ""))(request) } }),
        stream: async function* (request) {
          yield { output: { message: await (harness ?? (() => ""))(request) } };
        },
      },
    },
  };
  mode.application = {
    ...module.application,
    fill: (desc = {}) => {
      desc.data ??= {};
      module.application.schema?.fill(desc);
      return desc.data;
    },
    buffer: (desc = {}) => entities.buffer.create({ mode: row.id, view: null, ...desc, data: mode.application.fill(desc) }),
  };
  mode.aperture.use(shard.context.bind("daemon", daemon)).use(shard.context.bind("mode", mode));
  if (module.aperture) mode.aperture.slurp(module.aperture);
  if (module.tools) mode.tools.slurp(module.tools);
  daemon.modes[module.manifest.type] ??= {};
  daemon.modes[module.manifest.type][module.manifest.slug] = mode;
  const call = (path, input) => steer.dispatch.invoke(mode.aperture, path, steer.strategy.direct)({ daemon, mode, user: rig.user, thread: rig.thread, input });
  const tools = shape.proxy(mode.tools, steer.strategy.direct);
  const invoke = (path, input) => tools[path]({ daemon, mode, user: rig.user, thread: rig.thread, input });
  return { mode, row, call, invoke };
}

// a scripted engine: answers the contract, counts its calls, plays the first legal move it is
// told about. `lines` maps a FEN to the multipv it should answer with; `plays` maps a FEN to
// { [elo | "full"]: uci | [uci, …] } — what a limited-strength search plays there; a list deals
// one move per call, cycling, the way a randomised strength would.
export function engine({ lines = {}, plays = {}, name = "ScriptedFish" } = {}) {
  const calls = [];
  const dealt = new Map();
  // unscripted positions answer with legal moves, best first by the rules' own ordering
  const fallback = (fen) => rules.legal({ fen }).moves.slice(0, 3).map((move, index) => ({ cp: 20 - 5 * index, pv: [move.uci] }));
  const answer = (fen, depth, multipv) => {
    const held = lines[fen] ?? fallback(fen);
    return { engine: name, depth, multipv: held.slice(0, multipv), bestmove: held[0]?.pv[0] ?? null };
  };
  return {
    calls,
    evaluate: async ({ fen, depth = 16, multipv = 1 }) => {
      calls.push({ kind: "evaluate", fen, depth, multipv });
      return answer(fen, depth, multipv);
    },
    play: async ({ fen, elo }) => {
      calls.push({ kind: "play", fen, elo: elo ?? "full" });
      const scripted = plays[fen]?.[elo ?? "full"];
      const key = `${fen}|${elo ?? "full"}`;
      const turn = dealt.get(key) ?? 0;
      dealt.set(key, turn + 1);
      const pick = Array.isArray(scripted) ? scripted[turn % scripted.length] : scripted;
      return { uci: pick ?? answer(fen, 1, 1).bestmove, ponder: null };
    },
    about: () => ({ binary: "scripted", threads: 1, hash: 16, started: true, engine: name }),
    get name() {
      return name;
    },
    analyse: async function* ({ fen, depth = 16, multipv = 1 }) {
      calls.push({ kind: "analyse", fen, depth, multipv });
      const found = answer(fen, depth, multipv);
      for (const [index, line] of found.multipv.entries()) yield { kind: "info", depth, multipv: index + 1, ...line };
      yield { kind: "bestmove", uci: found.bestmove, ponder: null };
    },
    stop: () => {},
    close: () => {},
  };
}
