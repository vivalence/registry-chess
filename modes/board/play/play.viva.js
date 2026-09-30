import { App, v } from "@vivalence/typology";
import { MATCH } from "./types.js";

export { aperture } from "./aperture/index.js";
export { harness } from "./harness.js";
export { tools } from "./tools/index.js";

export const manifest = {
  type: "board",
  slug: "play",
  name: "Play",
  description:
    "A board and two seats. The buffer holds the live game — position, moves, clocks, who sits; a seat is a user, the engine, " +
    "or a hallucinator that may see the engine's assessment before it moves. A finished game seals into the corpus as a literal.",
  version: "0.1.0",
  traits: ["APPLICATION", "STANDALONE", "EXPOSED", "HARNESSED", "CONVERSATIONAL", "TOOLING", "AGENTIC"],
};

export const application = new App(
  "buffer/Play.svelte",
  v
    .buffer({
      data: MATCH,
      literals: v.array(v.rel(v.literal())).desc("The sealed game literal once the match has ended. Empty while playing. Example: []."),
    })
    .desc(
      "One live match. data.moves is the truth; data.fen is kept beside it so the board renders without replaying. Example: /match/create { seats: { white: { kind: \"user\" }, black: { kind: \"engine\", elo: 1600 } } }." +
        "/match/move plays the caller's move and then lets every non-user seat answer in turn; /match/step lets a bot seat move on its own.",
    ),
);
