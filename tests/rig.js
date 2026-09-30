import { Aperture, Connection, contexts, Path, shape, shard, steer, Twitch, Url, Vector } from "@vivalence/typology";
import { gestalten, sets, DaemonEntity, UserEntity } from "@vivalence/runtime";
import { provider as datamap, descriptors, twitches } from "@vivalence/runtime/scenarios";

import * as domain from "../domain/chess.viva.js";
import * as rules from "../domain/rules/index.js";
import game from "../topologies/game/dataset/symbols/ontological.js";
import position from "../topologies/position/dataset/symbols/ontological.js";
import opening from "../topologies/opening/dataset/symbols/ontological.js";
import puzzle from "../topologies/puzzle/dataset/symbols/ontological.js";

const { gather, mint, strike } = gestalten.belt;

export const DAEMON = "chess-rig";
export const TOPOLOGIES = ["game", "position", "opening", "puzzle"];
export const SYMBOLS = { game, position, opening, puzzle };

export async function mount({ engine = null } = {}) {
  const held = await datamap(descriptors);
  const { orm } = held;
  const em = held.entities.em;
  const runtime = new Twitch();
  for (const each of twitches) runtime.graft(each);
  runtime.branch("/after").use(shard.datamap.detached(held));
  held.registerSubscriber(runtime);
  const traits = Object.fromEntries(Object.keys(sets.traits).map((kind) => [kind, gather(domain, [], kind)]));
  const entities = { ...held.entities, ...strike(mint({ slug: DAEMON, kinds: sets.traits, traits }), em, sets.traits) };

  em.create(DaemonEntity, { slug: DAEMON, mask: { manifest: { type: "daemon", slug: DAEMON } } });
  const user = em.create(UserEntity, { slug: "beef" });
  await em.flush();

  const modes = {};
  for (const slug of TOPOLOGIES) {
    modes[slug] = entities.mode.create({ type: "topology", slug, name: slug, traits: [], installed: "", version: "0.1.0" });
  }
  await em.flush();
  const thread = em.create(sets.userspace.thread.entity, { user, mode: modes.game, traits: [], trait: {}, counter: 0 });
  await em.flush();
  em.setFilterParams("user", { user: user.id });

  for (const [slug, rows] of Object.entries(SYMBOLS)) {
    for (const row of rows) entities.symbol.create({ slug: row.slug, mode: modes[slug], traits: row.traits, trait: row.trait });
  }
  await em.flush();
  em.clear();

  const daemon = {
    slug: DAEMON,
    manifest: { slug: DAEMON, traits: [] },
    aperture: new Aperture(),
    twitch: new Twitch(),
    entities,
    datamap: held,
    providers: engine ? { engine } : {},
    domain,
    modes: {},
    reference: new Path(`/daemon/${DAEMON}`),
  };
  daemon.twitch.use(shard.context.spread(contexts.host, daemon)).use(shard.datamap.owned());
  daemon.twitch.branch("/after").use(shard.datamap.detached(held));
  held.registerSubscriber(daemon.twitch);
  daemon.aperture.use(shard.context.spread(contexts.host, daemon));
  domain.aperture.use(shard.context.spread(contexts.host, daemon));
  daemon.aperture.graft(domain.aperture);
  daemon.call = shape.proxy(domain.aperture, steer.strategy.direct);

  const handler = shape.http(daemon.aperture);
  const conn = new Connection(new Url("http://chess-rig"), shard.transmitter.inline(handler));

  const tools = shape.proxy(domain.tools, steer.strategy.direct);
  const caller = () => ({ ...shard.context.lift(contexts.host, daemon), user, mode: { id: modes.game.id }, thread });
  const call = (path, input) => steer.dispatch.invoke(domain.aperture, path, steer.strategy.direct)({ ...caller(), input });
  const invoke = (path, input) => tools[path]({ ...caller(), input });
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

export async function mountMode(rig, module, { harness = null } = {}) {
  const { entities, daemon } = rig;
  const em = entities.em;
  const row = entities.mode.create({
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
  if (module.buffer) mode.buffer = (desc = {}) => entities.buffer.create({ mode: row.id, ...desc, data: module.buffer.fill({ data: {}, ...desc }).data });
  mode.aperture.use(shard.context.spread(contexts.host, daemon)).use(shard.context.bind("mode", mode));
  if (module.aperture) mode.aperture.graft(module.aperture);
  if (module.tools) mode.tools.graft(module.tools);
  daemon.modes[module.manifest.type] ??= {};
  daemon.modes[module.manifest.type][module.manifest.slug] = mode;
  const call = (path, input) => steer.dispatch.invoke(mode.aperture, path, steer.strategy.direct)({ ...shard.context.lift(contexts.host, daemon), mode, user: rig.user, thread: rig.thread, input });
  const tools = shape.proxy(mode.tools, steer.strategy.direct);
  const invoke = (path, input) => tools[path]({ ...shard.context.lift(contexts.host, daemon), mode, user: rig.user, thread: rig.thread, input });
  return { mode, row, call, invoke };
}

export function engine({ lines = {}, plays = {}, name = "ScriptedFish" } = {}) {
  const calls = [];
  const dealt = new Map();
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
