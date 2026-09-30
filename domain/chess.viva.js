export * from "./entities/index.js";
export * as schematics from "./schematics.js";
export { aperture, resolve } from "./aperture/index.js";
export { tools } from "./tools/index.js";

export const manifest = {
  type: "domain",
  slug: "chess",
  name: "Chess",
  description:
    "Games, positions, openings and puzzles as literals; the rules behind one door; engines consumed, never declared. " +
    "The tools every chess mode's agent shares.",
  version: "0.1.0",
  traits: ["EXPOSED", "TOOLING"],
};
