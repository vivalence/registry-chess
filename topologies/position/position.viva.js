import { Dataset } from "@vivalence/typology";

export const manifest = {
  type: "topology",
  slug: "position",
  name: "Positions",
  description:
    "One chess position as a literal, keyed by its EPD — the unit every evaluation, book line and tablebase answer is cached on. " +
    "The position mount owns every position row, whichever mode reached it.",
  version: "0.1.0",
  traits: ["DATASET"],
};

export const dataset = new Dataset({ symbol: "dataset/symbols" });
