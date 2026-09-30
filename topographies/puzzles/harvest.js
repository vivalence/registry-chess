// harvest a stratified sample of lichess puzzles into dataset/literals/puzzles.json.
//
//   deno run -A --config <repo>/deno.jsonc ~/.viva/registry/chess/topographies/puzzles/harvest.js [per-level=200] [scan=300000]
//
// source: https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0, ~5M rows). the dump is
// streamed through `zstd -dc` and cut after `scan` rows — the ids are random, so the head is a
// fair sample. the API's /puzzle/next is rate-limited past use. needs the zstd CLI.
//
// the CSV's FEN is the position BEFORE the opponent's move; Moves[0] is that move and the
// solution starts at Moves[1]. the row written carries the position the solver sees, verified
// legal with chessops before it is kept.
import { Chess } from "https://esm.sh/chessops@0.14.2/chess";
import { makeFen, parseFen } from "https://esm.sh/chessops@0.14.2/fen";
import { parseUci } from "https://esm.sh/chessops@0.14.2/util";

const DUMP = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const PER_LEVEL = Number(Deno.args[0] ?? 200);
const SCAN = Number(Deno.args[1] ?? 300_000);
const OUT = new URL("./dataset/literals/puzzles.json", import.meta.url);

const LEVELS = [
  ["novice", 0, 1000],
  ["apprentice", 1000, 1400],
  ["club", 1400, 1800],
  ["expert", 1800, 2200],
  ["master", 2200, 9999],
];
const level = (rating) => (LEVELS.find(([, from, to]) => rating >= from && rating < to) ?? LEVELS.at(-1))[0];
const kebab = (theme) => theme.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();

const pose = (fen, moves) => {
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  const [first, ...solution] = moves;
  const opening = parseUci(first);
  if (!opening || !pos.isLegal(opening)) throw new Error(`opponent move ${first} illegal`);
  pos.play(opening);
  const walk = pos.clone();
  for (const uci of solution) {
    const move = parseUci(uci);
    if (!move || !walk.isLegal(move)) throw new Error(`solution ${uci} illegal`);
    walk.play(move);
  }
  return { fen: makeFen(pos.toSetup()), solution };
};

const process = new Deno.Command("sh", {
  args: ["-c", `curl -sL "${DUMP}" | zstd -dc | head -n ${SCAN + 1}`],
  stdout: "piped",
  stderr: "null",
}).spawn();

const counts = Object.fromEntries(LEVELS.map(([slug]) => [slug, 0]));
const rows = [];
let scanned = 0;
let held = "";
const decoder = new TextDecoder();
outer: for await (const chunk of process.stdout) {
  held += decoder.decode(chunk, { stream: true });
  let cut;
  while ((cut = held.indexOf("\n")) >= 0) {
    const line = held.slice(0, cut);
    held = held.slice(cut + 1);
    if (line.startsWith("PuzzleId")) continue;
    scanned++;
    const [id, fen, moves, rating, deviation, popularity, plays, themes] = line.split(",");
    if (!id || !fen || !moves) continue;
    const band = level(Number(rating));
    if (counts[band] >= PER_LEVEL) {
      if (Object.values(counts).every((count) => count >= PER_LEVEL)) break outer;
      continue;
    }
    if (Number(deviation) > 100 || Number(popularity) < 50) continue;
    try {
      const posed = pose(fen, moves.split(" "));
      const stamped = themes.split(" ").filter(Boolean).map(kebab);
      rows.push({
        slug: `puzzle-${id}`,
        traits: ["POSED", "SOURCED"],
        trait: {
          POSED: { ...posed, rating: Number(rating), themes: stamped, plays: Number(plays), level: band },
          SOURCED: { provider: "lichess", id, url: `https://lichess.org/training/${id}`, importedAt: new Date().toISOString() },
        },
        symbols: [{ slug: "puzzle" }, { slug: `puzzle.level.${band}` }, ...stamped.map((theme) => ({ slug: `puzzle.theme.${theme}` }))],
      });
      counts[band]++;
    } catch (error) {
      console.warn(`${id}: ${error.message} — skipped`);
    }
  }
}
try {
  process.kill();
} catch {
  // already done
}

rows.sort((a, b) => a.trait.POSED.rating - b.trait.POSED.rating);
await Deno.writeTextFile(OUT, JSON.stringify(rows, null, 1));
console.log(`scanned ${scanned} · ${JSON.stringify(counts)} · wrote ${rows.length} puzzles → ${OUT.pathname}`);
