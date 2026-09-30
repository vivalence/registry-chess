import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";
import * as rules from "../../rules/index.js";

export const RECORDED = traits.define("RECORDED", {
  schematic: v.object({}, { additionalProperties: true }),
  repository: {
    async seal({
      tags = {},
      moves,
      initial = rules.START,
      variant = "standard",
      result,
      reason,
      seats,
      clock,
      source,
      opening,
      variations = [],
    }) {
      const line = rules.replay({ fen: initial, moves, variant });
      const slug = await rules.digest(`${variant}|${initial}|${moves.join(" ")}`);
      const known = result ?? line.outcome?.result ?? tags.Result ?? "*";
      const why = reason ?? (line.checkmate ? "checkmate" : line.stalemate ? "stalemate" : line.insufficient ? "insufficient" : null);
      const { text: pgn } = rules.pgn.make({ tags: { ...tags, Result: known }, moves, initial, variant, variations });
      const traits = ["RECORDED", "TERMINATED"];
      const trait = {
        RECORDED: { tags: { ...tags, Result: known }, pgn, moves, initial, variant, plies: moves.length, ...(variations.length && { variations }) },
        TERMINATED: { result: known, reason: why },
      };
      if (seats) (traits.push("SEATED"), (trait.SEATED = seats));
      if (clock) (traits.push("CLOCKED"), (trait.CLOCKED = clock));
      if (source) (traits.push("SOURCED"), (trait.SOURCED = { ...source, importedAt: new Date().toISOString() }));
      if (opening) (traits.push("OPENED"), (trait.OPENED = opening));
      const resultSymbol = known === "1-0" ? "white" : known === "0-1" ? "black" : known === "1/2-1/2" ? "draw" : "unfinished";
      const row = await this.mint("game", slug, { traits, trait }, [
        `game.variant.${variant}`,
        `game.result.${resultSymbol}`,
        why ? `game.termination.${why}` : null,
        opening?.eco ? `opening.eco.${opening.eco}` : null,
      ]);
      return row;
    },
  },
});
