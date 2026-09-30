import { v } from "@vivalence/typology";

// the occupant drivers: one function per seat kind, each answering ONE move for the side to move.
// every driver gets the same brief — the match data and the legal moves — and returns
// { uci, comment?, tried? }. a driver that cannot answer says so; the loop decides what happens.

const ANSWER = v.object({
  uci: v.string().desc('The move, as UCI, from the legal list. Example: "g1f3".'),
  comment: v.string().optional().desc("One sentence for the operator. Example: \"Developing with tempo on the queen.\""),
});

const random = (moves) => moves[Math.floor(Math.random() * moves.length)];

export const drivers = {
  // the loop never asks a user seat — the user's move arrives through /match/move
  user: () => null,

  remote: () => {
    throw new Error("remote seats wait for the lighthouse relay — play a user, engine or hallucinator seat");
  },

  engine: async (ctx, { seat, data }) => {
    const service = ctx.daemon.services?.[seat.service ?? "engine"];
    if (!service) throw new Error(`no engine consumed under "${seat.service ?? "engine"}" — declare consume.engine on the daemon`);
    const { uci } = await service.play({ fen: data.fen, elo: seat.elo, movetime: seat.movetime, depth: seat.depth });
    return { uci };
  },

  hallucinator: async (ctx, { seat, data, legal }) => {
    const lines = seat.assisted ? await assessment(ctx, data.fen) : null;
    const tried = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const answer = await ask(ctx, { seat, data, legal, lines, tried });
      if (legal.moves.some((move) => move.uci === answer.uci)) return { ...answer, tried };
      tried.push(answer.uci);
    }
    // twice illegal: a random legal move, and the ply is marked so the record says so
    return { uci: random(legal.moves).uci, comment: "(the seat answered illegally twice; a legal move was played for it)", tried, fallback: true };
  },
};

const assessment = async (ctx, fen) => {
  try {
    const found = await ctx.daemon.call.position.eval({ ...ctx, input: { fen, depth: 12, multipv: 3 }, output: undefined });
    return found.evaluation?.multipv ?? null;
  } catch {
    return null;
  }
};

const ask = async (ctx, { seat, data, legal, lines, tried }) => {
  const side = data.turn;
  const brief = [
    `You play ${side}.${seat.persona ? ` Your persona: ${seat.persona}.` : ""}`,
    `Position (FEN): ${data.fen}`,
    data.sans.length ? `Moves so far: ${data.sans.join(" ")}` : "No moves yet.",
    legal.check ? "You are in check." : "",
    `Legal moves (UCI · SAN): ${legal.moves.map((move) => `${move.uci}·${move.san}`).join(" ")}`,
    lines?.length
      ? `Engine lines, best first: ${lines.map((line, index) => `${index + 1}) ${line.mate != null ? `mate in ${line.mate}` : `${(line.cp / 100).toFixed(2)}`} ${line.pv.slice(0, 5).join(" ")}`).join(" · ")}`
      : "",
    tried.length ? `You already answered ${tried.join(", ")} — not legal here. Choose from the list.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const render = await ctx.mode.harness.object.render({
    turns: [{ role: "user", parts: [{ type: "text", text: brief }] }],
    output: ANSWER,
    ...(seat.tune && { tune: seat.tune }),
  });
  const object = render?.output?.object ?? {};
  return { uci: String(object.uci ?? "").trim(), comment: object.comment };
};
