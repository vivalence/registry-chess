// harvest lichess's opening catalogue into dataset/literals/openings.json.
//
//   deno run -A --config <repo>/deno.jsonc ~/.viva/registry/chess/topographies/openings/harvest.js
//
// source: https://github.com/lichess-org/chess-openings — five TSVs (eco · name · pgn), CC0.
// a build-time script, not runtime code: it imports chessops itself to replay each line to its
// EPD, the key /opening/classify looks a position up by.
import { Chess } from "https://esm.sh/chessops@0.14.2/chess";
import { makeFen } from "https://esm.sh/chessops@0.14.2/fen";
import { parseSan } from "https://esm.sh/chessops@0.14.2/san";
import { makeUci } from "https://esm.sh/chessops@0.14.2/util";

const SOURCE = "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const FILES = ["a", "b", "c", "d", "e"];
const OUT = new URL("./dataset/literals/openings.json", import.meta.url);

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[''’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const digest = async (text) => {
  const hashed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hashed).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const replay = (pgn) => {
  const pos = Chess.default();
  const moves = [];
  for (const token of pgn.split(/\s+/)) {
    if (!token || /^\d+\.(\.\.)?$/.test(token)) continue;
    const san = token.replace(/^\d+\.(\.\.)?/, "");
    if (!san) continue;
    const move = parseSan(pos, san);
    if (!move) throw new Error(`cannot play ${san} in ${pgn}`);
    moves.push(makeUci(move));
    pos.play(move);
  }
  const fen = makeFen(pos.toSetup());
  return { moves, fen, epd: fen.split(" ").slice(0, 4).join(" ") };
};

const rows = [];
const seen = new Set();
for (const file of FILES) {
  const text = await (await fetch(`${SOURCE}/${file}.tsv`)).text();
  const [, ...lines] = text.trim().split("\n");
  for (const line of lines) {
    const [eco, name, pgn] = line.split("\t");
    if (!eco || !name || !pgn) continue;
    const { moves, fen, epd } = replay(pgn);
    const slug = `${eco.toLowerCase()}-${slugify(name)}-${(await digest(epd)).slice(0, 6)}`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    rows.push({
      slug,
      traits: ["CATALOGUED"],
      trait: { CATALOGUED: { eco, name, pgn, moves, fen, epd, plies: moves.length } },
      symbols: [{ slug: "opening" }, { slug: `opening.family.${eco[0]}` }, { slug: `opening.eco.${eco}` }],
    });
  }
  console.log(`${file}.tsv → ${rows.length} so far`);
}

await Deno.writeTextFile(OUT, JSON.stringify(rows, null, 1));
console.log(`wrote ${rows.length} openings → ${OUT.pathname}`);
