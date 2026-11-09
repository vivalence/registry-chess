import { traits } from "@vivalence/typology";
import { v } from "@vivalence/typology";
import * as rules from "../../rules/index.js";

export const PLACED = traits.define("PLACED", {
  schematic: v.object({}, { additionalProperties: true }),
  repository: {
    card: {
      fields: ["slug", "ontology", "traits"],
      populate: [],
      project: (literal) => ({
        slug: literal.slug,
        ontology: literal.ontology,
        ...(literal.trait?.PLACED && { fen: literal.trait.PLACED.fen }),
        ...(literal.trait?.RECORDED && { plies: literal.trait.RECORDED.plies, result: literal.trait.TERMINATED?.result }),
        ...(literal.trait?.CATALOGUED && { eco: literal.trait.CATALOGUED.eco, name: literal.trait.CATALOGUED.name }),
        ...(literal.trait?.POSED && { rating: literal.trait.POSED.rating, level: literal.trait.POSED.level }),
      }),
    },

    search(query) {
      const like = `%${query.search}%`;
      return [
        { slug: { $like: like } },
        { trait: { CATALOGUED: { name: { $like: like } } } },
        { trait: { RECORDED: { tags: { White: { $like: like } } } } },
        { trait: { RECORDED: { tags: { Black: { $like: like } } } } },
        { trait: { RECORDED: { tags: { Event: { $like: like } } } } },
      ];
    },

    async owner(kind) {
      const row = await this.entities.mode.findOne({ type: "topology", slug: kind });
      if (!row) throw new Error(`[chess] the kernel mounts no @chess/topology/${kind} — nothing may own a ${kind} row`);
      return row;
    },

    async symbolsNamed(slugs) {
      const wanted = [...new Set(slugs.filter(Boolean))];
      if (!wanted.length) return [];
      return this.entities.symbol.find({ slug: { $in: wanted } });
    },

    async mint(kind, slug, data, symbols) {
      const owner = await this.owner(kind);
      const held = await this.findOne({ slug, mode: owner.id });
      if (held) return held;
      const row = this.create({ slug, daemon: owner.daemon, mode: owner, ...data });
      for (const symbol of await this.symbolsNamed([kind, ...symbols])) row.symbols.add(symbol);
      await this.em.flush();
      return row;
    },

    async reach(fen) {
      const canonical = rules.fen(rules.position(fen));
      const slug = await rules.key(canonical);
      const { material, pieces } = rules.material(canonical);
      const phase = rules.phase(canonical);
      return this.mint(
        "position",
        slug,
        {
          traits: ["PLACED"],
          trait: { PLACED: { fen: canonical, epd: rules.epd(canonical), key: slug, material, pieces, phase } },
        },
        [`position.phase.${phase}`, pieces <= 7 ? `position.endgame.pieces.${pieces}` : null],
      );
    },
  },
});
