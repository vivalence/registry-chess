import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";

export const ANALYSED = traits.define("ANALYSED", {
  schematic: v.object({}, { additionalProperties: true }),
  repository: {
    async analysed(game, report) {
      game.trait = { ...game.trait, ANALYSED: report };
      if (!game.traits.includes("ANALYSED")) game.traits = [...game.traits, "ANALYSED"];
      await this.em.flush();
      return game;
    },
  },
});
