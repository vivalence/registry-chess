import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";

export const LADDERED = traits.define("LADDERED", {
  schematic: v.object({}, { additionalProperties: true }),
  repository: {
    rung(position, elo) {
      return position.trait?.LADDERED?.[String(elo)] ?? null;
    },

    async ladder(position, { elo, plays, engine, movetime }) {
      const held = this.rung(position, elo);
      const entry = { plays: [...(held?.plays ?? []), ...plays], engine: engine ?? held?.engine ?? null, movetime: movetime ?? held?.movetime ?? null, at: new Date().toISOString() };
      position.trait = { ...position.trait, LADDERED: { ...(position.trait?.LADDERED ?? {}), [String(elo)]: entry } };
      if (!position.traits.includes("LADDERED")) position.traits = [...position.traits, "LADDERED"];
      await this.em.flush();
      return entry;
    },
  },
});
