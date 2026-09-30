import { App, v } from "@vivalence/typology";
import { FILTERS } from "./types.js";

export { aperture } from "./aperture/index.js";
export { FILTERS } from "./types.js";

export const manifest = {
  type: "library",
  slug: "games",
  name: "Library",
  description:
    "The game corpus in a list: every sealed and imported game, newest first, filtered by result, opening family or analysis; " +
    "paste a PGN to import; open any game in the study.",
  version: "0.1.0",
  traits: ["APPLICATION", "STANDALONE", "EXPOSED"],
};

export const GAME = v.object({
  id: v.string(),
  slug: v.string(),
  players: v.string().desc('White – Black. Example: "Morphy – Duke Karl / Count Isouard".'),
  result: v.string().desc('Example: "1-0".'),
  reason: v.string().optional().desc('Example: "checkmate".'),
  eco: v.string().optional().desc('Example: "C41".'),
  opening: v.string().optional().desc('Example: "Philidor Defense".'),
  date: v.string().optional().desc('The PGN Date tag, or the year of it. Example: "1858".'),
  event: v.string().optional().desc('Example: "Paris".'),
  plies: v.integer(),
  analysed: v.boolean().desc("Whether the study has stamped a report on it. Example: false."),
  source: v.string().optional().desc('Where it came from. Example: "lichess".'),
});

export const application = new App(
  "buffer/Library.svelte",
  v
    .buffer({
      data: {
        filter: v.enum(FILTERS).default("all").desc('The chip in force. Example: "1-0".'),
        games: v.array(GAME).default([]).desc("The rows the filter shows, newest first."),
        count: v.integer().default(0).desc("How many games the corpus holds in all. Example: 12."),
        sentence: v.string().optional().desc('The last import\'s answer. Example: "1 game imported · classified · positions reached".'),
        tone: v.enum(["success", "warning", "danger"]).optional().desc('The colour of the sentence. Example: "success".'),
      },
    })
    .desc("The corpus in a list. /library/list fills it under a filter; /library/import adds games; opening one is the study's business. Example: /library/list { filter: \"1-0\" }."),
);
