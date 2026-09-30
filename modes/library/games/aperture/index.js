import { v, Vector } from "@vivalence/typology";
import { FILTERS } from "../types.js";

const BUFFER = v.string().desc("The library buffer's id. Example: \"01JQ…\".");
const LIMIT = 200;

const domain = (ctx, door, path, input) => ctx.daemon.call[door][path]({ ...ctx, input, output: undefined });

const load = async (ctx, id) => {
  const buffer = await ctx.daemon.entities.buffer.findOneOrFail({ id });
  return { buffer, data: { ...buffer.data } };
};

const save = async (ctx, buffer, data) => {
  await ctx.daemon.entities.buffer.updateOne({ id: buffer.id }, { data });
  return data;
};

// one row per game literal, the way the list shows it
const row = (literal) => {
  const tags = literal.trait?.RECORDED?.tags ?? {};
  const players = [tags.White, tags.Black].filter((name) => name && name !== "?").join(" – ") || literal.slug;
  const date = tags.Date && tags.Date !== "????.??.??" ? tags.Date.slice(0, 4) : undefined;
  return {
    id: literal.id,
    slug: literal.slug,
    players,
    result: literal.trait?.TERMINATED?.result ?? tags.Result ?? "*",
    reason: literal.trait?.TERMINATED?.reason ?? undefined,
    eco: literal.trait?.OPENED?.eco ?? undefined,
    opening: literal.trait?.OPENED?.name ?? undefined,
    date,
    event: tags.Event && tags.Event !== "?" ? tags.Event : undefined,
    plies: literal.trait?.RECORDED?.plies ?? 0,
    analysed: literal.traits?.includes("ANALYSED") ?? false,
    source: literal.trait?.SOURCED?.provider ?? undefined,
  };
};

const keep = (filter) => (game) => {
  if (filter === "all") return true;
  if (filter === "analysed") return game.analysed;
  if (filter === "½-½") return game.result === "1/2-1/2";
  if (filter.startsWith("eco.")) return game.eco?.startsWith(filter.slice(4)) ?? false;
  return game.result === filter;
};

// fill the buffer under its filter: the newest games in the corpus, then the filter in memory;
// the count is the whole corpus's, not the page's
const fill = async (ctx, buffer, data) => {
  const rows = await domain(ctx, "game", "list", { limit: LIMIT });
  const all = rows.map(row);
  data.count = (await domain(ctx, "game", "count", {})).count;
  data.games = all.filter(keep(data.filter ?? "all"));
  return save(ctx, buffer, data);
};

export const aperture = new Vector();

aperture
  .branch("/library")
  .open(
    {
      nature: "/list",
      valence: 'Fill a library buffer with the corpus under a filter — result, opening family, analysed. Opens a buffer unless one is given. Example: { filter: "1-0" }.',
      input: v.object({ buffer: BUFFER.optional(), filter: v.enum(FILTERS).optional(), thread: v.string().optional() }),
    },
    async (ctx) => {
      if (ctx.input.buffer) {
        const { buffer, data } = await load(ctx, ctx.input.buffer);
        return fill(ctx, buffer, { ...data, filter: ctx.input.filter ?? data.filter ?? "all" });
      }
      const thread = ctx.input.thread ?? ctx.thread?.id;
      const buffer = await ctx.mode.application.buffer({ data: { filter: ctx.input.filter ?? "all" }, ...(thread && { thread }) });
      await ctx.daemon.entities.em.flush();
      return fill(ctx, buffer, { ...buffer.data });
    },
  )
  .open(
    {
      nature: "/import",
      valence: "Import PGN text into the corpus and refresh the list; the answer says what was new and what was already held. Example: { buffer: \"01JQ…\", pgn: \"1. e4 e5 …\" }.",
      input: v.object({ buffer: BUFFER, pgn: v.string().desc("PGN text, one game or many."), source: v.string().optional().desc('Where it came from. Example: "lichess".') }),
    },
    async (ctx) => {
      const { buffer, data } = await load(ctx, ctx.input.buffer);
      const text = ctx.input.pgn.trim();
      if (!text) return save(ctx, buffer, { ...data, sentence: "paste a PGN first.", tone: "warning" });
      let found;
      try {
        found = await domain(ctx, "game", "import", { pgn: text, ...(ctx.input.source && { source: { provider: ctx.input.source } }) });
      } catch (error) {
        return save(ctx, buffer, { ...data, sentence: `not a PGN I can read — ${error.message}`, tone: "danger" });
      }
      const classified = found.games.filter((game) => game.opening).length;
      data.sentence = found.imported
        ? `${found.imported} game${found.imported === 1 ? "" : "s"} imported · ${classified} classified · positions reached${found.held ? ` · ${found.held} already held` : ""}`
        : found.held
          ? "already held — nothing duplicated."
          : "no game in that text.";
      data.tone = found.imported ? "success" : "warning";
      return fill(ctx, buffer, data);
    },
  );
