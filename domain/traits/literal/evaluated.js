import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";

const EVALUATIONS_KEPT = 8;

export const EVALUATED = traits.define("EVALUATED", {
  schematic: v.array(v.any()),
  repository: {
    evaluated(position, { depth = 0 } = {}) {
      const held = position.trait?.EVALUATED ?? [];
      return held.find((entry) => (entry.depth ?? 0) >= depth) ?? null;
    },

    async record(position, evaluation) {
      const held = position.trait?.EVALUATED ?? [];
      position.trait = { ...position.trait, EVALUATED: [evaluation, ...held].slice(0, EVALUATIONS_KEPT) };
      if (!position.traits.includes("EVALUATED")) position.traits = [...position.traits, "EVALUATED"];
      await this.em.flush();
      return evaluation;
    },
  },
});
