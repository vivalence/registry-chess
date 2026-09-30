import { Dataset } from "@vivalence/typology";

export const manifest = {
  type: "topography",
  slug: "puzzles",
  name: "Riddles",
  description:
    "A body of chess riddles across the five levels, each with the one line that solves it. " +
    "Harvested from the lichess puzzle API (CC0) by harvest.js into dataset/literals/puzzles.json — a sample, not the five-million-row dump.",
  version: "0.1.0",
  traits: ["DATASET"],
};

export const dataset = new Dataset({ literal: "dataset/literals/puzzles.json" });
