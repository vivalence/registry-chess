import { Dataset } from "@vivalence/typology";

export const manifest = {
  type: "topology",
  slug: "puzzle",
  name: "Puzzles",
  description: "A riddle as a literal — a position, whose move, the one line that solves it, its rating, its level, its themes.",
  version: "0.1.0",
  traits: ["DATASET"],
};

export const dataset = new Dataset({ symbol: "dataset/symbols" });
