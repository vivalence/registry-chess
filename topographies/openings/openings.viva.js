import { Dataset } from "@vivalence/typology";

export const manifest = {
  type: "topography",
  slug: "openings",
  name: "Opening catalogue",
  description:
    "Every named opening lichess catalogues — ECO code, name, the line, the position it reaches. " +
    "Harvested from lichess-org/chess-openings (CC0) by harvest.js into dataset/literals/openings.json.",
  version: "0.1.0",
  traits: ["DATASET"],
};

export const dataset = new Dataset({ literal: "dataset/literals/openings.json" });
