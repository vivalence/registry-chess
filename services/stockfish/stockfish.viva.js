export { provider } from "./provider/index.js";

export const manifest = {
  type: "service",
  slug: "stockfish",
  name: "Stockfish",
  description:
    "A UCI engine behind the engine contract — analyse (streamed), evaluate, play. One process per daemon, one search at a time. " +
    "The binary is a static; a missing one is a sentence at the first call, never a boot failure.",
  version: "0.1.0",
  traits: [],
};
