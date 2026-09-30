import { mime, v, Vector } from "@vivalence/typology";
import { MATCH } from "./types.js";

const SEATED = { white: { kind: "user" }, black: { kind: "engine", elo: 1600, movetime: 600 } };
const BLITZ = { initial: 180, increment: 2 };

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
  traits: ["VIEWABLE", "EXPOSED", "HARNESSED", "CONVERSATIONAL", "TOOLING", "AGENTIC"],
};

export const buffer = v
  .buffer({
    data: MATCH,
    literals: v.array(v.rel(v.literal())).desc("The sealed game literal once the match has ended. Empty while playing. Example: []."),
  })
  .desc(
    "One live match. data.moves is the truth; data.fen is kept beside it so the board renders without replaying. Example: /match/create { seats: { white: { kind: \"user\" }, black: { kind: \"engine\", elo: 1600 } } }." +
      "/match/move plays the caller's move and then lets every non-user seat answer in turn; /match/step lets a bot seat move on its own.",
  );

export const views = [
  { slug: "play", mount: "buffer/Play.svelte", mime: mime.dom.svelte },
  { slug: "play", mount: "buffer/play.jsx", mime: mime.tty.solid },
];

export const keymap = new Vector()
  .open({ nature: "leader/g/n", valence: "new game — you against the engine, blitz. Example: ctrl-v g n" }, (ctx) =>
    ctx.mode.call.match.create({ seats: SEATED, clock: BLITZ, thread: ctx.client.terminal.thread.id }))
  .open({ nature: "leader/g/r", valence: "resign the game on the frame. Example: ctrl-v g r" }, (ctx) =>
    ctx.mode.call.match.resign({ buffer: ctx.client.terminal.buffer.id }));
