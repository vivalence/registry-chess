import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";
import * as rules from "../../rules/index.js";

export const CATALOGUED = traits.define("CATALOGUED", {
  schematic: v.object({}, { additionalProperties: true }),
  repository: {
    async classify(fens) {
      const epds = fens.map((fen) => rules.epd(fen));
      const rows = await this.find({ ontology: "opening", trait: { CATALOGUED: { epd: { $in: epds } } } });
      const byEpd = new Map(rows.map((row) => [row.trait.CATALOGUED.epd, row]));
      for (let index = epds.length - 1; index >= 0; index--) {
        const hit = byEpd.get(epds[index]);
        if (hit) {
          const { eco, name, pgn } = hit.trait.CATALOGUED;
          return { eco, name, pgn, lastBookPly: index, opening: hit };
        }
      }
      return null;
    },
  },
});
