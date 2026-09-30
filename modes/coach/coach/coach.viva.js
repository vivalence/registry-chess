export { harness } from "./harness.js";

// the coach is headless: no App, no doors. what it OFFERS is its skills — each thinks with the
// coach's harness and tools. the runtime carries a mode's offer on `tools`, the one export AGENTIC
// reads, so the skills ride there; the coach's own tools stay on its harness (harness.js).
export { skills as tools } from "./skills/index.js";

export const manifest = {
  type: "coach",
  slug: "coach",
  name: "Coach",
  description:
    "The headless coach: offers skills — ask, review, explain, suggest, teach — each thinking with its own harness over its own tools: the boards, " +
    "the games played, the engine's analysis, the puzzles. An agentic game carries it; the talk happens there.",
  version: "0.1.0",
  traits: ["HARNESSED", "TOOLING"],
};
