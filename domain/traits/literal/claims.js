import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";

const object = () => v.object({}, { additionalProperties: true });

export const OPENED = traits.define("OPENED", { schematic: object() });
export const CLOCKED = traits.define("CLOCKED", { schematic: object() });
export const TERMINATED = traits.define("TERMINATED", { schematic: object() });
export const SOURCED = traits.define("SOURCED", { schematic: object() });
export const SEATED = traits.define("SEATED", { schematic: object() });
export const BOOKED = traits.define("BOOKED", { schematic: v.array(v.any()) });
export const TABLEBASED = traits.define("TABLEBASED", { schematic: object() });
