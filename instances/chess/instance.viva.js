import paladin from "@vivalence/paladin";
import { v } from "@vivalence/typology";
import { chess } from "./daemon.js";

export const manifest = { type: "instance", slug: "chess", version: "0.1.0" };

export const runtime = {
  manifest: { slug: "runtime" },
  statics: {
    serve: () => paladin.env.get("VIVA_RUNTIME_SERVE"),
    remote: () => paladin.env.get("PUBLIC_VIVA_RUNTIME_REMOTE"),
  },
};

export const datamap = { module: "@commons/datamap/libsql" };

export const hallucinators = [
  {
    module: "@commons/hallucinator/anthropic",
    secrets: { key: () => paladin.secret.get("SECRET_VIVA_ANTHROPIC_API_KEY") },
  },
  {
    module: "@commons/hallucinator/openrouter",
    secrets: { key: () => paladin.secret.get("SECRET_VIVA_OPENROUTER_API_KEY") },
  },
];

export const daemons = [chess];

export const clients = [
  {
    manifest: { type: "client", slug: "anima" },
    statics: { serve: () => paladin.env.get("VIVA_CLIENT_ANIMA_SERVE") },
  },
];

export const services = [
  {
    manifest: { type: "lighthouse", slug: "multiplayer" },
    module: "@commons/lighthouse/multiplayer",
    secrets: { jwt: () => paladin.secret.get("SECRET_VIVA_JWT") },
  },
];

export const lighthouse = {
  module: "@commons/lighthouse/multiplayer",
  statics: { remote: () => paladin.env.get("PUBLIC_VIVA_LIGHTHOUSE_REMOTE") },
};

export const environment = v.environment({
  VIVA_RUNTIME_ORIGIN: v.url().desc("Scheme and authority the runtime is reachable at. Every address below derives from it.").default("http://localhost:2501").group("addresses"),
  VIVA_CLIENT_ANIMA_ORIGIN: v.url().desc("Scheme and authority the anima browser client is reachable at.").default("http://localhost:1794").group("addresses"),
  VIVA_RUNTIME_SERVE: v.url().desc("Base URL the runtime serves on. Everything else hangs off this latch.").default("${VIVA_RUNTIME_ORIGIN}/").group("addresses"),
  VIVA_CLIENT_ANIMA_SERVE: v.url().desc("Where the anima browser client serves.").default("${VIVA_CLIENT_ANIMA_ORIGIN}/").group("addresses"),
  PUBLIC_VIVA_RUNTIME_REMOTE: v.url().desc("Runtime address the browser bundle calls. Reaches it through publish(), not a thunk.").default("${VIVA_RUNTIME_SERVE}").group("addresses"),
  PUBLIC_VIVA_LIGHTHOUSE_REMOTE: v.url().desc("Lighthouse address as CONSUMED. Set it for a lighthouse on another host; unset, paladin computes this runtime's reach + the hosting service's seat.").group("addresses").optional(),
  VIVA_SERVICE_STOCKFISH_BINARY: v.string().desc("The UCI engine binary the daemon spawns. brew install stockfish puts it on PATH. Example: stockfish").default("stockfish").group("engine"),
  VIVA_SERVICE_STOCKFISH_THREADS: v.string().desc("Search threads the engine may use. Example: 2").default("2").group("engine"),
  VIVA_SERVICE_STOCKFISH_HASH: v.string().desc("Transposition table in MB. Example: 128").default("128").group("engine"),
  SECRET_VIVA_JWT: v.string({ minLength: 24 }).desc("Lighthouse signing secret. Minted at first init; rotate with: openssl rand -base64 24").default(() => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))).group("keys"),
  SECRET_VIVA_ANTHROPIC_API_KEY: v.string().desc("Anthropic key. Declare either provider, both, or neither — a key left blank leaves its hallucinator dormant.").group("keys").optional(),
  SECRET_VIVA_OPENROUTER_API_KEY: v.string().desc("OpenRouter key. The alternative provider. With neither key the hallucinator seats, the coach and the explainer stay silent; play, riddles and analysis still work.").group("keys").optional(),
});
