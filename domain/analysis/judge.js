import { accuracy, judgeLoss, winPercentOf } from "./winrate.js";

// judge a game from one evaluation per position. `plies[i]` is the move played from position i;
// `evaluations[i]` is the engine's view of position i (before ply i+1), so a game of N plies
// carries N+1 evaluations. every score is from the side to move at that position.
//
// returns the report the ANALYSED trait carries: per-ply judgements, accuracy and average
// centipawn loss per side, and a tally of words.
export const judge = ({ plies, evaluations, engine, depth }) => {
  const judgements = [];
  const losses = { white: [], black: [] };
  const cpLosses = { white: [], black: [] };
  const counts = { white: {}, black: {} };

  for (let index = 0; index < plies.length; index++) {
    const ply = plies[index];
    const before = evaluations[index]?.multipv?.[0] ?? null;
    const afterLine = evaluations[index + 1]?.multipv?.[0] ?? null;
    const mover = index % 2 === 0 ? "white" : "black";

    // the mover's win % before the move, and after it — the after-score is from the OPPONENT's
    // view, so it flips.
    const beforePercent = winPercentOf(before);
    const afterPercent = afterLine ? 100 - winPercentOf(afterLine) : beforePercent;
    const loss = Math.max(0, beforePercent - afterPercent);
    const best = before?.pv?.[0] ?? null;
    const same = best === ply.uci;
    const word = judgeLoss(loss, { same });

    const cpBefore = typeof before?.cp === "number" ? before.cp : before?.mate ? Math.sign(before.mate) * 1000 : 0;
    const cpAfter = afterLine
      ? typeof afterLine.cp === "number" ? -afterLine.cp : afterLine.mate ? -Math.sign(afterLine.mate) * 1000 : 0
      : cpBefore;
    cpLosses[mover].push(Math.max(0, cpBefore - cpAfter));
    losses[mover].push(accuracy(beforePercent, afterPercent));
    counts[mover][word] = (counts[mover][word] ?? 0) + 1;

    judgements.push({
      ply: index + 1,
      uci: ply.uci,
      san: ply.san,
      before: round(beforePercent),
      after: round(afterPercent),
      loss: round(loss),
      judgement: word,
      ...(best && !same ? { best } : {}),
      ...(before ? { eval: { ...(typeof before.cp === "number" ? { cp: before.cp } : {}), ...(typeof before.mate === "number" ? { mate: before.mate } : {}), pv: before.pv ?? [] } } : {}),
    });
  }

  const mean = (list) => (list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0);

  return {
    engine,
    depth,
    accuracy: { white: round(mean(losses.white)), black: round(mean(losses.black)) },
    acpl: { white: Math.round(mean(cpLosses.white)), black: Math.round(mean(cpLosses.black)) },
    counts,
    judgements,
  };
};

const round = (value) => Math.round(value * 10) / 10;
