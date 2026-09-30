// a UCI engine that is not an engine: answers the protocol, searches nothing, plays the first
// legal moves it finds. what the provider suite drives instead of a binary.
//
//   deno run -A --config <repo>/deno.jsonc fake-uci.js
import { Chess } from "https://esm.sh/chessops@0.14.2/chess";
import { parseFen } from "https://esm.sh/chessops@0.14.2/fen";
import { makeUci } from "https://esm.sh/chessops@0.14.2/util";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const say = (line) => Deno.stdout.write(encoder.encode(line + "\n"));

let fen = null;
let multipv = 1;
const options = {};

const legal = () => {
  const pos = fen ? Chess.fromSetup(parseFen(fen).unwrap()).unwrap() : Chess.default();
  const moves = [];
  for (const [from, targets] of pos.allDests()) for (const to of targets) moves.push(makeUci({ from, to }));
  return moves.sort();
};

const go = async (line) => {
  const depth = Number(line.match(/depth (\d+)/)?.[1] ?? 6);
  const moves = legal();
  if (!moves.length) return say("bestmove (none)");
  for (let d = 1; d <= depth; d++) {
    for (let i = 1; i <= Math.min(multipv, moves.length); i++) {
      const pv = [moves[i - 1], ...(moves[i] ? [moves[i]] : [])];
      const score = options.UCI_Elo ? `cp ${Number(options.UCI_Elo) - 1500}` : i === 1 && d >= 4 && fen?.includes("K1k") ? "mate 1" : `cp ${10 * d - 5 * (i - 1)}`;
      await say(`info depth ${d} seldepth ${d + 2} multipv ${i} score ${score} nodes ${d * 1000} nps 1000 time ${d} pv ${pv.join(" ")}`);
    }
  }
  await say(`bestmove ${moves[0]} ponder ${moves[1] ?? "(none)"}`);
};

let held = "";
for await (const chunk of Deno.stdin.readable) {
  held += decoder.decode(chunk, { stream: true });
  let cut;
  while ((cut = held.indexOf("\n")) >= 0) {
    const line = held.slice(0, cut).trim();
    held = held.slice(cut + 1);
    if (line === "uci") await say("id name FakeFish 0.1"), await say("uciok");
    else if (line === "isready") await say("readyok");
    else if (line.startsWith("setoption")) {
      const match = line.match(/name (\S+) value (\S+)/);
      if (match) options[match[1]] = match[2];
      if (match?.[1] === "MultiPV") multipv = Number(match[2]);
    } else if (line.startsWith("position fen")) fen = line.slice("position fen ".length).split(" moves ")[0];
    else if (line.startsWith("position startpos")) fen = null;
    else if (line.startsWith("go")) await go(line);
    else if (line === "quit") Deno.exit(0);
  }
}
