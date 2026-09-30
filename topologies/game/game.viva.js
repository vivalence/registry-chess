import { Dataset } from "@vivalence/typology";

export const manifest = {
  type: "topology",
  slug: "game",
  name: "Games",
  description: "A game of chess as a literal: its record, its result, how it ended, who sat, what it was played at.",
  version: "0.1.0",
  traits: ["DATASET"],
};

export const dataset = new Dataset({ symbol: "dataset/symbols" });
