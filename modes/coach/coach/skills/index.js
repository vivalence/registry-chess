import { v, Vector } from "@vivalence/typology";
import { analyse, moments, position, record } from "../tools/index.js";

// the coach's skills: each runs the coach's OWN harness — its voice, its tools (tools/index.js),
// the domain's — and answers in a shape the code checks before it leaves. a tool reads; a skill
// thinks. this vector is what the coach offers: an AGENTIC game arms it as coach_*.

const domain = (ctx, door, path, input) => ctx.daemon.call[door][path]({ ...ctx, input, output: undefined });

const coach = (ctx) => ctx.daemon.modes.coach?.coach;

const ABSENT = { condition: "ERROR", message: "the coach is not kernelled on this daemon — @chess/coach/coach" };

const think = (mode, text, output) =>
  mode.harness.object.render({ turns: [{ role: "user", parts: [{ type: "text", text }] }], output }).then((render) => render?.output?.object ?? {});

const numbered = (sans) => sans.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san)).join(" ");

// the engine's best lines for a position, walked into SAN by the domain — what a model may name
const lines = async (ctx, fen, multipv = 3) => {
  const [found, legal] = await Promise.all([domain(ctx, "position", "lines", { fen, multipv, depth: 14, plies: 6 }), domain(ctx, "rules", "legal", { fen })]);
  const rows = found.lines.map((line) => ({ uci: line.uci[0], san: line.san[0], score: line.score, pv: line.san }));
  return { rows, legal, message: found.lines.length ? null : found.message };
};

const shown = (rows) => rows.map((row, index) => `${index + 1}) ${row.san} (${row.uci}) ${row.score} · ${row.pv.join(" ")}`).join("\n");

const where = async (ctx, { fen, buffer }) => {
  if (fen) return { fen, sans: [] };
  const held = position(await ctx.daemon.entities.buffer.findOneOrFail({ id: buffer }));
  return { fen: held.fen, sans: held.sans };
};

const ANSWER = v.object({ answer: v.string().desc("The coach's answer, plain, a few sentences. Example: \"Black's knight on d4 is the problem: it forks c2 and e2.\"") });

const REVIEW = v.object({
  summary: v.string().desc("How the game went, in two or three plain sentences. Example: \"White won a piece early and converted.\""),
  moments: v
    .array(
      v.object({
        ply: v.integer().desc("The ply, from 1. Example: 14."),
        san: v.string().desc('The move played there, as SAN, exactly as the game has it. Example: "Qxb7".'),
        note: v.string().desc("What it did and what was better, in one sentence. Example: \"Grabs the pawn but leaves the back rank open.\""),
      }),
    )
    .desc("The turning points, in game order — only plies the report names."),
  lesson: v.string().desc("One thing to take into the next game. Example: \"Check every capture for a back-rank reply.\""),
});

const EXPLANATION = v.object({
  happening: v.array(v.string()).desc("What is going on: material, the threat, the pieces. Two or three short points. Example: [\"Material is level.\", \"Black threatens Nxe4.\"]"),
  candidates: v
    .array(v.object({ san: v.string().desc('A move from the engine\'s lines, as SAN. Example: "Nf3".'), idea: v.string().desc("Its idea and trade-off in one sentence.") }))
    .desc("Two or three candidates, only from the engine's lines."),
  plan: v.string().desc("The plan from here, in one or two sentences."),
  best: v.string().desc('The first move of the engine\'s line 1, as SAN. Example: "Nf3".'),
});

const SUGGESTION = v.object({
  uci: v.string().desc('The move, as UCI, from the legal list. Example: "g1f3".'),
  reason: v.string().desc("Why, in one sentence a player at that strength would follow."),
});

const LESSON = v.object({
  idea: v.string().desc("What the puzzle is about — the theme in plain words, without the moves unless revealed. Example: \"The queen is overloaded guarding two squares.\""),
  hint: v.string().desc("A nudge that does not give the first move away. Example: \"Look at what the rook on d8 has to defend.\""),
  line: v.string().optional().desc("The solution walked through move by move — only when it was revealed to you."),
});

export const skills = new Vector()
  .open(
    {
      nature: "/ask",
      valence:
        "Hand a chess question to the coach: it reads the boards, the games and the puzzles with its own tools, asks the engine, and answers. " +
        "Name what the question is about when you know it. Example: { question: \"why did I lose this?\", game: \"01JQ…\" }.",
      input: v.object({
        question: v.string().desc('The question, in the asker\'s words. Example: "what is black threatening?".'),
        buffer: v.string().optional().desc("A board the question is about — a match or a riddle. Example: \"01JQ…\"."),
        game: v.string().optional().desc("A game from the corpus the question is about."),
        puzzle: v.string().optional().desc("A puzzle the question is about."),
      }),
    },
    async (ctx) => {
      const mode = coach(ctx);
      if (!mode?.harness) return ABSENT;
      // the coach asking the coach is a loop, not a second opinion
      if (ctx.mode === mode) return { condition: "ERROR", message: "you are the coach — answer with your tools" };
      const { question, buffer, game, puzzle } = ctx.input;
      const about = [buffer && `board ${buffer}`, game && `game ${game}`, puzzle && `puzzle ${puzzle}`].filter(Boolean).join(", ");
      const answer = await think(mode, `${question}${about ? `\n(About: ${about}. Read it with your tools before you answer.)` : ""}`, ANSWER);
      return { answer: answer.answer ?? "", message: answer.answer ?? "the coach had nothing to say." };
    },
  )
  .open(
    {
      nature: "/review",
      valence:
        "Review a game as a coach: the engine analyses it, the coach reads the report and answers with a summary, the turning points and one lesson. " +
        "Example: { game: \"01JQ…\" }.",
      input: v.object({ game: v.string().desc("A game literal's id or slug. Example: \"01JQ…\"."), depth: v.integer().default(12).optional() }),
    },
    async (ctx) => {
      const mode = coach(ctx);
      if (!mode?.harness) return ABSENT;
      const { row, recorded, sans, analysed } = await record(ctx, ctx.input.game);
      const report = analysed ?? (await analyse(ctx, { game: row.id, depth: ctx.input.depth ?? 12 }));
      if (!report) return { condition: "ERROR", message: "no engine is consumed on this daemon — a review needs the analysis" };
      const tags = recorded.tags ?? {};
      const brief = [
        `${tags.White ?? "?"} vs ${tags.Black ?? "?"} · ${tags.Result ?? "*"}`,
        `Moves: ${numbered(sans)}`,
        `Engine report (${report.engine}, depth ${report.depth}): accuracy white ${report.accuracy.white}, black ${report.accuracy.black}.`,
        "The worst moves by win chance lost:",
        ...moments(report).map((judgement) =>
          `- ply ${judgement.ply} ${judgement.san}: ${judgement.judgement}, ${judgement.loss}% lost${judgement.best ? `, engine preferred ${judgement.best}` : ""}${judgement.eval?.pv?.length ? ` (line ${judgement.eval.pv.slice(0, 4).join(" ")})` : ""}`,
        ),
        "Review this game for the player. Name only moments from the list above, with the SAN exactly as given.",
      ].join("\n");
      const review = await think(mode, brief, REVIEW);
      // the model may only name plies the game has, with the SAN the game has there
      const kept = (review.moments ?? []).filter((moment) => sans[moment.ply - 1] === moment.san);
      return {
        game: row.id,
        summary: review.summary ?? "",
        moments: kept,
        lesson: review.lesson ?? "",
        message: [review.summary, ...kept.map((moment) => `${moment.ply}. ${moment.san} — ${moment.note}`), review.lesson ? `Lesson: ${review.lesson}` : ""].filter(Boolean).join("\n"),
      };
    },
  )
  .open(
    {
      nature: "/explain",
      valence:
        "Explain a position the way a strong player thinks: what is happening, the candidate moves from the engine's lines, the plan, the best move. " +
        "Give a FEN or a board. Example: { buffer: \"01JQ…\" }.",
      input: v.object({ fen: v.string().optional().desc("A position as FEN."), buffer: v.string().optional().desc("A board — its current position is explained.") }),
    },
    async (ctx) => {
      const mode = coach(ctx);
      if (!mode?.harness) return ABSENT;
      if (!ctx.input.fen && !ctx.input.buffer) return { condition: "ERROR", message: "give a fen or a board" };
      const { fen, sans } = await where(ctx, ctx.input);
      const { rows, message } = await lines(ctx, fen);
      if (!rows.length) return { condition: "ERROR", message: message ?? "the engine gave no lines for this position" };
      const brief = [`FEN: ${fen}`, sans.length ? `Moves so far: ${numbered(sans)}` : "", "The engine's lines, best first:", shown(rows), "Explain this position. Candidates only from these lines; best is line 1's first move."]
        .filter(Boolean)
        .join("\n");
      const explained = await think(mode, brief, EXPLANATION);
      const allowed = new Set(rows.map((row) => row.san));
      const candidates = (explained.candidates ?? []).filter((candidate) => allowed.has(candidate.san));
      const best = rows[0].san;
      return {
        fen,
        happening: explained.happening ?? [],
        candidates,
        plan: explained.plan ?? "",
        best,
        lines: rows,
        message: [...(explained.happening ?? []), ...candidates.map((candidate) => `${candidate.san}: ${candidate.idea}`), explained.plan, `Best: ${best}.`].filter(Boolean).join("\n"),
      };
    },
  )
  .open(
    {
      nature: "/suggest",
      valence:
        "The coach picks a move for the side to move on a board, at a strength, with one line why. It does not play it — match_move does. " +
        'Example: { buffer: "01JQ…", strength: "club" }.',
      input: v.object({
        buffer: v.string().desc("The board. Example: \"01JQ…\"."),
        strength: v.enum(["gentle", "club", "strong"]).default("club").optional().desc("gentle leaves chances, club plays a good move, strong plays the engine's first line."),
      }),
    },
    async (ctx) => {
      const mode = coach(ctx);
      if (!mode?.harness) return ABSENT;
      const { fen } = await where(ctx, ctx.input);
      const strength = ctx.input.strength ?? "club";
      const { rows, legal } = await lines(ctx, fen);
      const brief = [
        `FEN: ${fen}`,
        `Legal moves (UCI·SAN): ${legal.moves.map((move) => `${move.uci}·${move.san}`).join(" ")}`,
        rows.length ? `The engine's lines, best first:\n${shown(rows)}` : "No engine lines.",
        `Pick one move at ${strength} strength (gentle: sound but not sharp; club: a good move; strong: the engine's line 1).`,
      ].join("\n");
      const picked = await think(mode, brief, SUGGESTION);
      const move = legal.moves.find((candidate) => candidate.uci === String(picked.uci ?? "").trim());
      if (!move) return { condition: "ERROR", message: `the coach answered ${picked.uci ?? "nothing"}, which is not legal here` };
      return { uci: move.uci, san: move.san, reason: picked.reason ?? "", message: `${move.san} (${move.uci}) — ${picked.reason ?? ""}` };
    },
  )
  .open(
    {
      nature: "/teach",
      valence:
        "Teach a puzzle: its idea and a hint that does not give the first move away; with reveal, the solution walked through. " +
        'Example: { puzzle: "01JQ…", reveal: false }.',
      input: v.object({
        puzzle: v.string().desc("A puzzle literal's id or slug — a riddle buffer carries it as puzzle.id. Example: \"01JQ…\"."),
        reveal: v.boolean().default(false).optional().desc("Walk through the solution — only after the riddle is over, or when asked."),
      }),
    },
    async (ctx) => {
      const mode = coach(ctx);
      if (!mode?.harness) return ABSENT;
      const literal = ctx.daemon.entities.literal;
      const row = await literal.findOneOrFail(literal.reference(ctx.input.puzzle));
      const { fen, solution, themes = [], rating, level } = row.trait.POSED;
      const reveal = Boolean(ctx.input.reveal);
      const walked = (await domain(ctx, "rules", "replay", { fen, moves: solution })).plies.map((ply) => ply.san);
      const line = reveal ? walked : null;
      const brief = [
        `Puzzle ${row.slug} · ${level} (${rating}) · themes ${themes.join(", ") || "none"}`,
        `FEN: ${fen} — ${fen.split(" ")[1] === "w" ? "white" : "black"} to move, ${solution.length} plies.`,
        reveal ? `Solution: ${line.join(" ")}` : "The solution is NOT revealed: teach the idea and give a hint that does not name the first move.",
      ].join("\n");
      const taught = await think(mode, brief, LESSON);
      // unrevealed, the first move never leaves in the coach's words
      const first = walked[0].replace(/[+#]/g, "");
      const gives = (text) => !reveal && (text ?? "").includes(first);
      if (gives(taught.hint)) taught.hint = `Look at what ${fen.split(" ")[1] === "w" ? "white" : "black"} can force: checks, captures, threats.`;
      if (gives(taught.idea)) taught.idea = themes.length ? `A ${themes.join(", ")} puzzle.` : "Find the forcing move.";
      return {
        puzzle: row.id,
        idea: taught.idea ?? "",
        hint: taught.hint ?? "",
        ...(reveal && { line: taught.line ?? "", sans: line }),
        message: [taught.idea, `Hint: ${taught.hint ?? ""}`, reveal ? `Solution: ${line.join(" ")} — ${taught.line ?? ""}` : ""].filter(Boolean).join("\n"),
      };
    },
  );
