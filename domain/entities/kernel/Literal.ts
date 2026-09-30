import { types, EntitySchema, EntityRepositoryType, raw, type Opt } from "@mikro-orm/core";
import { literal as base, ModeEntity } from "@vivalence/runtime";
import * as rules from "../../rules/index.js";
import { level as levelOf } from "../../schematics.js";
import { SymbolEntity } from "./Symbol.ts";

// the trait vocabulary of a chess literal. a literal is a game OR a position OR an opening OR a
// puzzle — the one TOPOGRAPHICAL symbol says which, and the runtime subscriber throws on two.
export enum LiteralTraitsEnum {
  // game
  RECORDED = "RECORDED", // { tags, pgn, moves, initial, variant, plies, variations? }
  OPENED = "OPENED", // { eco, name, pgn, lastBookPly }
  CLOCKED = "CLOCKED", // { initial, increment }
  TERMINATED = "TERMINATED", // { result, reason }
  SOURCED = "SOURCED", // { provider, id?, url?, importedAt }
  SEATED = "SEATED", // { white: Occupant, black: Occupant }
  ANALYSED = "ANALYSED", // REPORT
  // position
  PLACED = "PLACED", // { fen, epd, key, material, phase }
  EVALUATED = "EVALUATED", // [EVALUATION…] newest first
  LADDERED = "LADDERED", // { [elo | "full"]: { plays: [uci], engine, movetime, at } } — what the engine limited to elo played here, one uci per sample
  BOOKED = "BOOKED", // [{ uci, san, weight, games, white, draw, black }]
  TABLEBASED = "TABLEBASED", // { category, wdl, dtz, moves }
  // opening
  CATALOGUED = "CATALOGUED", // { eco, name, pgn, moves, epd }
  // puzzle
  POSED = "POSED", // { fen, solution, rating, themes, plays, level }
}

const EVALUATIONS_KEPT = 8;

export class LiteralRepository extends base.repository {
  get card() {
    return {
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
    };
  }

  search(query: any) {
    const like = `%${query.search}%`;
    return [
      { slug: { $like: like } },
      { trait: { CATALOGUED: { name: { $like: like } } } },
      { trait: { RECORDED: { tags: { White: { $like: like } } } } },
      { trait: { RECORDED: { tags: { Black: { $like: like } } } } },
      { trait: { RECORDED: { tags: { Event: { $like: like } } } } },
    ];
  }

  // the mount that owns every row of an ontology: the topology's own mode row. a corpus row with
  // no owner has no uniqueness — sqlite counts NULLs distinct on (slug, mode) — so every write
  // here goes through owner() and never lands unowned.
  async owner(kind: string) {
    const row = await this.em.findOne(ModeEntity, { type: "topology", slug: kind });
    if (!row) throw new Error(`[chess] the kernel mounts no @chess/topology/${kind} — nothing may own a ${kind} row`);
    return row;
  }

  async symbolsNamed(slugs: string[]) {
    const wanted = [...new Set(slugs.filter(Boolean))];
    if (!wanted.length) return [];
    return this.em.find(SymbolEntity, { slug: { $in: wanted } });
  }

  async mint(kind: string, slug: string, data: any, symbols: string[]) {
    const owner = await this.owner(kind);
    const held = await this.findOne({ slug, mode: owner.id });
    if (held) return held;
    const row = this.create({ slug, mode: owner, ...data });
    for (const symbol of await this.symbolsNamed([kind, ...symbols])) row.symbols.add(symbol);
    await this.em.flush();
    return row;
  }

  // ── position ──────────────────────────────────────────────────────────────────────────────

  // the ONLY writer of a position literal. upserts by key under the position mount.
  async reach(fen: string) {
    const canonical = rules.fen(rules.position(fen));
    const slug = await rules.key(canonical);
    const { material, pieces } = rules.material(canonical);
    const phase = rules.phase(canonical);
    return this.mint(
      "position",
      slug,
      {
        traits: [LiteralTraitsEnum.PLACED],
        trait: { PLACED: { fen: canonical, epd: rules.epd(canonical), key: slug, material, pieces, phase } },
      },
      [`position.phase.${phase}`, pieces <= 7 ? `position.endgame.pieces.${pieces}` : null],
    );
  }

  // the cache read: the newest evaluation at or beyond the asked depth, or null.
  evaluated(position: LiteralEntity, { depth = 0 }: { depth?: number } = {}) {
    const held = position.trait?.EVALUATED ?? [];
    return held.find((entry) => (entry.depth ?? 0) >= depth) ?? null;
  }

  // append an evaluation, newest first, capped.
  async record(position: LiteralEntity, evaluation: any) {
    const held = position.trait?.EVALUATED ?? [];
    position.trait = { ...position.trait, EVALUATED: [evaluation, ...held].slice(0, EVALUATIONS_KEPT) };
    if (!position.traits.includes(LiteralTraitsEnum.EVALUATED)) position.traits = [...position.traits, LiteralTraitsEnum.EVALUATED];
    await this.em.flush();
    return evaluation;
  }

  // the ladder cache read: every move the engine limited to `elo` played here, or null.
  rung(position: LiteralEntity, elo: number | string) {
    return position.trait?.LADDERED?.[String(elo)] ?? null;
  }

  // record more samples of one rung on the position — the cache only ever grows.
  async ladder(position: LiteralEntity, { elo, plays, engine, movetime }: { elo: number | string; plays: string[]; engine?: string | null; movetime?: number | null }) {
    const held = this.rung(position, elo);
    const entry = { plays: [...(held?.plays ?? []), ...plays], engine: engine ?? held?.engine ?? null, movetime: movetime ?? held?.movetime ?? null, at: new Date().toISOString() };
    position.trait = { ...position.trait, LADDERED: { ...(position.trait?.LADDERED ?? {}), [String(elo)]: entry } };
    if (!position.traits.includes(LiteralTraitsEnum.LADDERED)) position.traits = [...position.traits, LiteralTraitsEnum.LADDERED];
    await this.em.flush();
    return entry;
  }

  // ── game ──────────────────────────────────────────────────────────────────────────────────

  // seal a finished (or imported) game as a literal. identity is the digest of initial + moves,
  // so the same game imported twice is one row and the caller can tell.
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
  }: any) {
    const line = rules.replay({ fen: initial, moves, variant });
    const slug = await rules.digest(`${variant}|${initial}|${moves.join(" ")}`);
    const known = result ?? line.outcome?.result ?? tags.Result ?? "*";
    const why = reason ?? (line.checkmate ? "checkmate" : line.stalemate ? "stalemate" : line.insufficient ? "insufficient" : null);
    // the abandoned lines ride in the PGN text as RAVs; `moves` stays the line that was finished,
    // so every reader of RECORDED.moves — analysis, openings, the elo ladder — is untouched
    const { text: pgn } = rules.pgn.make({ tags: { ...tags, Result: known }, moves, initial, variant, variations });
    const traits = [LiteralTraitsEnum.RECORDED, LiteralTraitsEnum.TERMINATED];
    const trait: any = {
      RECORDED: { tags: { ...tags, Result: known }, pgn, moves, initial, variant, plies: moves.length, ...(variations.length && { variations }) },
      TERMINATED: { result: known, reason: why },
    };
    if (seats) (traits.push(LiteralTraitsEnum.SEATED), (trait.SEATED = seats));
    if (clock) (traits.push(LiteralTraitsEnum.CLOCKED), (trait.CLOCKED = clock));
    if (source) (traits.push(LiteralTraitsEnum.SOURCED), (trait.SOURCED = { ...source, importedAt: new Date().toISOString() }));
    if (opening) (traits.push(LiteralTraitsEnum.OPENED), (trait.OPENED = opening));
    const resultSymbol = known === "1-0" ? "white" : known === "0-1" ? "black" : known === "1/2-1/2" ? "draw" : "unfinished";
    const row = await this.mint("game", slug, { traits, trait }, [
      `game.variant.${variant}`,
      `game.result.${resultSymbol}`,
      why ? `game.termination.${why}` : null,
      opening?.eco ? `opening.eco.${opening.eco}` : null,
    ]);
    return row;
  }

  // deepest catalogued opening along a line of positions. one query, then the last hit wins.
  async classify(fens: string[]) {
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
  }

  async analysed(game: LiteralEntity, report: any) {
    game.trait = { ...game.trait, ANALYSED: report };
    if (!game.traits.includes(LiteralTraitsEnum.ANALYSED)) game.traits = [...game.traits, LiteralTraitsEnum.ANALYSED];
    await this.em.flush();
    return game;
  }

  // ── puzzle ────────────────────────────────────────────────────────────────────────────────

  // one riddle, at random, in a level, not among the excluded.
  async puzzle({ level, themes, exclude = [] }: { level?: string; themes?: string[]; exclude?: string[] } = {}) {
    const where: any = { ontology: "puzzle" };
    const symbols: string[] = [];
    if (level) symbols.push(`puzzle.level.${level}`);
    for (const theme of themes ?? []) symbols.push(`puzzle.theme.${theme}`);
    if (symbols.length) where.symbols = symbols;
    if (exclude.length) where.id = { $nin: exclude };
    return this.findOne(where, { orderBy: { [raw("random()")]: "asc" } });
  }

  async pose({ id, fen, solution, rating, themes = [], plays = 0, source }: any) {
    const canonical = rules.fen(rules.position(fen));
    rules.replay({ fen: canonical, moves: solution });
    const slug = `puzzle-${id}`;
    const band = levelOf(rating);
    return this.mint(
      "puzzle",
      slug,
      {
        traits: [LiteralTraitsEnum.POSED, ...(source ? [LiteralTraitsEnum.SOURCED] : [])],
        trait: {
          POSED: { fen: canonical, solution, rating, themes, plays, level: band },
          ...(source ? { SOURCED: { ...source, importedAt: new Date().toISOString() } } : {}),
        },
      },
      [`puzzle.level.${band}`, ...themes.map((theme: string) => `puzzle.theme.${theme}`)],
    );
  }
}

export class LiteralEntity extends base.entity {
  traits: LiteralTraitsEnum[] & Opt = [];
  [EntityRepositoryType]?: LiteralRepository;

  implements(trait: string): boolean {
    return this.traits.includes(trait as LiteralTraitsEnum);
  }
}

export const LiteralSchema = new EntitySchema({
  class: LiteralEntity,
  extends: base.schema,
  tableName: "Literal",
  name: "Literal",
  repository: () => LiteralRepository,
  properties: {
    traits: {
      items: () => LiteralTraitsEnum,
      enum: true,
      array: true,
      defaultRaw: `'[]'`,
      type: types.json,
    },
  },
});

export default {
  type: "literal",
  traits: LiteralTraitsEnum,
  schema: LiteralSchema,
  entity: LiteralEntity,
  repository: LiteralRepository,
};
