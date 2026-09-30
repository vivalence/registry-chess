import { raw } from "@mikro-orm/core";
import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";
import * as rules from "../../rules/index.js";
import { level as levelOf } from "../../schematics.js";

export const POSED = traits.define("POSED", {
  schematic: v.object({}, { additionalProperties: true }),
  repository: {
    async puzzle({ level, themes, exclude = [] } = {}) {
      const where = { ontology: "puzzle" };
      const symbols = [];
      if (level) symbols.push(`puzzle.level.${level}`);
      for (const theme of themes ?? []) symbols.push(`puzzle.theme.${theme}`);
      if (symbols.length) where.symbols = symbols;
      if (exclude.length) where.id = { $nin: exclude };
      return this.findOne(where, { orderBy: { [raw("random()")]: "asc" } });
    },

    async pose({ id, fen, solution, rating, themes = [], plays = 0, source }) {
      const canonical = rules.fen(rules.position(fen));
      rules.replay({ fen: canonical, moves: solution });
      const slug = `puzzle-${id}`;
      const band = levelOf(rating);
      return this.mint(
        "puzzle",
        slug,
        {
          traits: ["POSED", ...(source ? ["SOURCED"] : [])],
          trait: {
            POSED: { fen: canonical, solution, rating, themes, plays, level: band },
            ...(source ? { SOURCED: { ...source, importedAt: new Date().toISOString() } } : {}),
          },
        },
        [`puzzle.level.${band}`, ...themes.map((theme) => `puzzle.theme.${theme}`)],
      );
    },
  },
});
