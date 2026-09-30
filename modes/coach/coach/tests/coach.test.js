import { specimen, steer, Vector } from "@vivalence/typology";
import * as coach from "../coach.viva.js";
import { tools as reads } from "../tools/index.js";
import * as play from "../../../board/play/play.viva.js";
import { engine, mount, mountMode } from "../../../../tests/rig.js";

const { describe, it, expect, beforeAll, afterAll } = specimen;

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("coach — headless, offering skills", () => {
  it("P-manifest: coach/coach has a harness and offers skills, and no App, no doors", () => {
    expect(coach.manifest.type).toBe("coach");
    expect([...coach.manifest.traits].sort()).toEqual(["HARNESSED", "TOOLING"]);
    expect(coach.application).toBeUndefined();
    expect(coach.aperture).toBeUndefined();
    expect([...coach.tools.trie.keys()].sort()).toEqual(["ask", "explain", "review", "suggest", "teach"]);
  });

  it("P-own-tools: the coach's reads are armed on its own harness, never offered", async () => {
    const ctx = { hallucination: { system: {}, tools: new Vector() } };
    const probe = new Vector().slurp(coach.harness).open("probe", () => null);
    await steer.dispatch.invoke(probe, "/probe", steer.strategy.direct)(ctx);
    expect(ctx.hallucination.system.coach).toMatch(/You are a chess coach/);
    expect([...ctx.hallucination.tools.trie.keys()].sort()).toEqual(["analyse", "board", "game", "games", "puzzle", "solution"]);
  });
});

describe("coach — reads and skills", { sanitizeResources: false, sanitizeOps: false }, () => {
  let rig;
  let board;
  let desk;
  let shelf;
  let asked;
  let answers;
  let game;
  let match;
  let puzzle;
  // a skill as the game calls it: the caller is the play mode, not the coach
  const fromPlay = (path, input) =>
    steer.dispatch.invoke(desk.mode.tools, path, steer.strategy.direct)({ daemon: rig.daemon, mode: board.mode, user: rig.user, thread: rig.thread, input });

  beforeAll(async () => {
    rig = await mount({ engine: engine() });
    board = await mountMode(rig, play);
    asked = [];
    answers = [];
    // the scripted coach: answers what the test queued, and records what it was asked
    desk = await mountMode(rig, coach, {
      harness: async (request) => {
        asked.push(request);
        return answers.shift() ?? {};
      },
    });
    shelf = await mountMode(rig, { manifest: { type: "probe", slug: "reads", name: "reads", traits: [], version: "0" }, tools: reads });
    match = await board.call("/match/create", { seats: { white: { kind: "user" }, black: { kind: "user" } } });
    await board.call("/match/move", { buffer: match.id, uci: "e2e4" });
    await board.call("/match/move", { buffer: match.id, uci: "e7e5" });
    const ended = await board.call("/match/resign", { buffer: match.id, side: "white" });
    game = ended.game;
    const posed = await rig.entities.literal.pose({ id: "mate-in-one", fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", solution: ["h5f7"], rating: 900, themes: ["mateIn1"] });
    await rig.em.flush();
    puzzle = posed.id;
  });

  afterAll(async () => rig?.close());

  it("P-reads: a board, the games, one game and its analysis read back", async () => {
    const read = await shelf.invoke("/board", { buffer: match.id });
    expect(read.message).toMatch(/Moves: 1\. e4 e5/);
    expect(read.message).toMatch(/Engine: ScriptedFish depth 14/);
    const listed = await shelf.invoke("/games", {});
    expect(listed.games.some((row) => row.game === game)).toBe(true);
    expect((await shelf.invoke("/game", { game })).sans).toEqual(["e4", "e5"]);
    expect((await shelf.invoke("/analyse", { game, depth: 6 })).report.judgements.length).toBe(2);
  });

  it("P-review: keeps only the moments the game has", async () => {
    answers.push({
      summary: "White resigned after one move each.",
      moments: [{ ply: 1, san: "e4", note: "A central start." }, { ply: 9, san: "Qxf7#", note: "Not in this game." }],
      lesson: "Play on.",
    });
    const review = await fromPlay("/review", { game, depth: 6 });
    expect(asked.at(-1).turns[0].parts[0].text).toMatch(/Moves: 1\. e4 e5/);
    expect(review.moments).toEqual([{ ply: 1, san: "e4", note: "A central start." }]);
    expect(review.message).toMatch(/Lesson: Play on\./);
  });

  it("P-explain: candidates only from the engine's lines, and best is line 1", async () => {
    answers.push({ happening: ["Nothing is attacked."], candidates: [{ san: "Nh3", idea: "made up" }, { san: "a3", idea: "the engine's" }], plan: "Develop.", best: "h4" });
    const explained = await fromPlay("/explain", { fen: START });
    const engineFirst = explained.lines.map((line) => line.san);
    expect(explained.best).toBe(engineFirst[0]);
    expect(explained.candidates.every((candidate) => engineFirst.includes(candidate.san))).toBe(true);
  });

  it("P-suggest: a legal move comes back with its reason; an illegal one is refused", async () => {
    answers.push({ uci: "g1f3", reason: "Develops." });
    expect((await fromPlay("/suggest", { buffer: (await board.call("/match/create", {})).id })).san).toBe("Nf3");
    answers.push({ uci: "e2e5", reason: "nonsense" });
    const refused = await fromPlay("/suggest", { buffer: (await board.call("/match/create", {})).id });
    expect(refused.condition).toBe("ERROR");
  });

  it("P-ask: the question reaches the coach with what it is about; the coach never asks itself", async () => {
    answers.push({ answer: "You resigned with the position level." });
    const answer = await fromPlay("/ask", { question: "why did I lose?", game });
    expect(asked.at(-1).turns[0].parts[0].text).toMatch(new RegExp(`game ${game}`));
    expect(answer.answer).toMatch(/level/);
    expect((await desk.invoke("/ask", { question: "loop?" })).condition).toBe("ERROR");
  });

  it("P-teach: unrevealed, the first move never leaves in the coach's words; revealed, the line comes with it", async () => {
    answers.push({ idea: "Qxf7 mates.", hint: "Play Qxf7#." });
    const hidden = await fromPlay("/teach", { puzzle });
    expect(asked.at(-1).turns[0].parts[0].text).toMatch(/NOT revealed/);
    expect(hidden.message).not.toMatch(/Qxf7/);
    expect(hidden.sans).toBeUndefined();
    answers.push({ idea: "f7 is weak.", hint: "Look at f7.", line: "The queen takes on f7 with mate." });
    const shown = await fromPlay("/teach", { puzzle, reveal: true });
    expect(shown.sans).toEqual(["Qxf7#"]);
  });
});
