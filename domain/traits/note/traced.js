import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";

export const TRACED = traits.define("TRACED", {
  schematic: v.object({ kind: v.string(), signal: v.any(), status: v.string(), snapshot: v.any().default({}) }),
});
