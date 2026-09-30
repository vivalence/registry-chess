import { Dataset } from "@vivalence/typology";

export const manifest = {
  type: "topology",
  slug: "opening",
  name: "Openings",
  description: "A named opening as a literal — its ECO code, its line, the position it reaches. ECO A00–E99 as symbols a game may wear too.",
  version: "0.1.0",
  traits: ["DATASET"],
};

export const dataset = new Dataset({ symbol: "dataset/symbols" });
