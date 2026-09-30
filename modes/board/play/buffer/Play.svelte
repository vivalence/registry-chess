<script>
  import { onDestroy, onMount } from "svelte";
  import Shell from "./kit/Shell.svelte";
  import Board from "./kit/Board.svelte";
  import Seat from "./kit/Seat.svelte";
  import Moves from "./kit/Moves.svelte";
  import Setup from "./panels/Setup.svelte";
  import { captures } from "./kit/material.js";
  import { open as openMode, show, TABS } from "./kit/open.js";

  // mounted by anima's Frame with { terminal, daemon, mode, thread, buffer }. the buffer IS the
  // match — position, moves, seats, clocks, the legal destinations — and every change lands on
  // $data through its subscription, so no effect here ever calls the wire.
  const { terminal, daemon, mode, thread, buffer } = $props();
  const data = buffer.$data;

  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const KINDS = ["user", "engine", "hallucinator"];
  const ELOS = [1320, 1600, 2000, 2400, 2800];
  // a match the nav mints: you against stockfish at 1600, three minutes and two seconds a move
  const SEATED = { white: { kind: "user" }, black: { kind: "engine", elo: 1600, movetime: 600 } };
  const BLITZ = { initial: 180, increment: 2 };
  const STUDY = TABS.find((tab) => tab.type === "study");

  let busy = $state(false);
  let fault = $state(null);
  let flipped = $state(false);
  let panel = $state("setup");
  let open = $state(true);
  let now = $state(Date.now());
  // the ended game whose card was put away, to look at the board
  let hidden = $state(null);

  const call = (path, input) => mode.call.match[path](input);

  const seats = $derived($data.seats ?? SEATED);
  const status = $derived($data.status ?? "pending");
  // rewound: the door computes the position the board shows and whose move it is there, so the
  // view never replays a line itself. `cursor` absent means the board is at the live tip.
  const rewindable = $derived(Boolean($data.rewindable));
  const cursor = $derived($data.cursor ?? null);
  const rewound = $derived(cursor != null);
  const fen = $derived($data.shown?.fen ?? $data.fen ?? START);
  const turn = $derived($data.shown?.turn ?? $data.turn ?? "white");
  const ended = $derived(status === "ended" && !rewound);
  const me = $derived(seats.white.kind === "user" ? "white" : seats.black.kind === "user" ? "black" : "white");
  const orientation = $derived(flipped ? (me === "white" ? "black" : "white") : me);
  const top = $derived(orientation === "white" ? "black" : "white");
  // a rewound board is movable when the seat at THAT ply is the user's — the move forks the game
  const myMove = $derived(!ended && seats[turn]?.kind === "user");
  const bothBots = $derived(seats.white.kind !== "user" && seats.black.kind !== "user");
  // exactly one seat is the user's: the result can be told as theirs
  const solo = $derived((seats.white.kind === "user") !== (seats.black.kind === "user"));
  const lastMove = $derived(rewound ? ($data.shown?.lastMove ?? null) : ($data.moves?.at?.(-1) ?? null));
  const mover = $derived(turn === "white" ? "black" : "white");
  const plies = $derived($data.moves?.length ?? 0);
  // what each seat has lost in the position ON SCREEN — rewind and the piles walk back with it
  const material = $derived(captures({ fen, initial: $data.initial ?? START }));
  const pending = $derived(status === "pending");
  // the first move bakes the seats and the clock into the game
  const locked = $derived(plies > 0 || ended);
  // a match nobody has started, with a bot to move: it waits for ▶ start. the user's own first
  // move is the start when the user has white — the board is the button then
  const waiting = $derived(pending && seats[turn]?.kind !== "user");

  // the clocks: the buffer carries seconds left and when the running one was last read; the view
  // counts the running one down from there between subscriptions
  const left = (side) => {
    const clock = $data.clock;
    if (!clock) return null;
    let seconds = clock[side] ?? clock.initial;
    if (clock.running === side && clock.at) seconds -= (now - Date.parse(clock.at)) / 1000;
    return Math.max(0, seconds);
  };
  const shown = (side) => {
    const seconds = left(side);
    if (seconds == null) return "";
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  };

  let ticker = null;
  let live = true;
  onMount(() => {
    ticker = setInterval(() => (now = Date.now()), 500);
    // a buffer the nav minted empty becomes a match on first sight; a match under way that a bot
    // owes a move to gets it. a match not yet started waits for ▶ start, whoever sits where
    if (!$data.fen) fresh({ clock: BLITZ });
    else if (status === "playing" && seats[turn]?.kind !== "user") guard("resume", () => drive({ ...$data }));
  });
  onDestroy(() => {
    live = false;
    clearInterval(ticker);
  });

  const guard = async (label, work) => {
    busy = true;
    try {
      const out = await work();
      fault = null;
      return out;
    } catch (error) {
      fault = `${label} · ${error.message}`;
      return null;
    } finally {
      busy = false;
    }
  };

  // one bot ply after another until a user is to move, the match ends or the view is gone
  const drive = async (state) => {
    let current = state;
    while (live && current && current.status !== "ended" && current.seats?.[current.turn]?.kind !== "user") {
      const answer = await call("step", { buffer: buffer.id });
      if (!answer?.moved) break;
      current = answer.data;
    }
    return current;
  };

  const move = (uci) => guard("move", async () => drive(await call("move", { buffer: buffer.id, uci })));
  const start = () => guard("start", () => drive({ ...$data, seats, status, turn }));
  const resign = () => guard("resign", () => call("resign", { buffer: buffer.id, side: me }));
  // walking a rewindable match: the door holds the cursor, the board follows it
  const seek = (ply) => (rewindable && !busy ? guard("seek", () => call("seek", { buffer: buffer.id, ply: Math.max(0, Math.min(plies, ply)) })) : null);
  const at = $derived(cursor ?? plies);
  const back = () => seek(at - 1);
  const forward = () => seek(at + 1);
  const resume = () => seek(plies);
  const offer = () => guard("offer", () => call("offer", { buffer: buffer.id, side: me, draw: true }));
  // a new match never plays a move: with a bot to move it waits for ▶ start. `clock` null means
  // untimed; left out, the match keeps its time control. `seated` left out keeps the seats
  const kept = () => ($data.clock ? { initial: $data.clock.initial, increment: $data.clock.increment ?? 0 } : null);
  const fresh = ({ clock = kept(), seated = seats, rewind = rewindable } = {}) =>
    guard("new", async () => {
      const created = await call("create", { buffer: buffer.id, seats: seated, ...(clock && { clock }), rewindable: rewind, thread: thread?.id });
      return created?.data ?? created;
    });
  // nor does a seat change: a bot that now owns the move waits for ▶ start like any other
  const seat = (side, occupant) => guard("seat", () => call("seat", { buffer: buffer.id, side, occupant }));

  // what comes after the end: the same seats swapped, the setup open, the game in the study, the board
  const rematch = () => fresh({ seated: { white: seats.black, black: seats.white } });
  const setup = async () => {
    await fresh();
    panel = "setup";
    open = true;
  };
  const analyse = () =>
    guard("analyse", async () => {
      const held = await openMode(terminal, daemon, STUDY, { fresh: true, show: false });
      await held.mode.call.analysis.load({ buffer: held.buffer.id, game: $data.game, thread: held.thread.id });
      show(terminal, held);
    });
  const review = () => {
    hidden = $data.game;
    panel = "moves";
    open = true;
  };
  const cycleKind = (side) => {
    const kind = KINDS[(KINDS.indexOf(seats[side].kind) + 1) % KINDS.length];
    return seat(side, kind === "user" ? { kind } : kind === "engine" ? { kind, elo: 1600, movetime: 600 } : { kind, assisted: true });
  };
  const cycleOption = (side) => {
    const held = seats[side];
    if (held.kind === "engine") return seat(side, { ...held, elo: ELOS[(ELOS.indexOf(held.elo ?? 1600) + 1) % ELOS.length] });
    if (held.kind === "hallucinator") return seat(side, { ...held, assisted: !held.assisted });
  };
  const name = (side) => {
    const held = seats[side];
    return held.kind === "user" ? "you" : held.kind === "engine" ? "stockfish" : held.kind === "hallucinator" ? "model" : "remote";
  };
  const option = (side) => {
    const held = seats[side];
    return held.kind === "engine" ? `${held.elo ?? 1600} elo` : held.kind === "hallucinator" ? (held.assisted ? "assisted" : "unassisted") : "";
  };
  const optionHint = (side) => (seats[side].kind === "engine" ? "click to change strength" : "click to let the model see the engine's lines, or not");

  // the result as a line, and as the user's own outcome when one seat is theirs
  const verdict = $derived(`${$data.result} · ${$data.reason}${$data.opening ? ` · ${$data.opening.eco} ${$data.opening.name}` : ""}`);
  const outcome = $derived(
    $data.result === "1/2-1/2" ? "a draw" : solo ? (($data.result === "1-0") === (me === "white") ? "you won" : "you lost") : $data.result === "1-0" ? "white wins" : "black wins",
  );
  const starting = $derived(bothBots ? "start the engines" : "start the match");

  // the dock's note: what the match wants said now, most urgent first
  const note = $derived(
    fault
      ? { by: "fault", text: fault, tone: "danger" }
      : rewound
        ? {
            by: "rewound",
            text: myMove
              ? `showing ply ${at} of ${plies} — play a move here to fork the game, › to come back`
              : `showing ply ${at} of ${plies} — ${name(turn)} is to move here, so step to one of your own to fork it`,
            tone: "warning",
          }
        : ended
        ? { by: "result", text: verdict, tone: "primary" }
        : $data.offers?.draw
          ? { by: "offer", text: `${$data.offers.draw} offers a draw${$data.offers.draw === me ? " — waiting for the other seat" : " — ½ offers back to accept"}`, tone: "warning" }
          : $data.thinking
            ? { by: name(mover), text: $data.thinking }
            : waiting
              ? { by: "setup", text: bothBots ? "two seats, no user — ▶ start lets them play" : `${name(turn)} has ${turn} — ▶ start begins the match` }
              : null,
  );

  // over the board: the end of a game and what comes next; a match waiting for its start
  const overlay = $derived(
    ended && hidden !== $data.game
      ? {
          label: "game over",
          title: outcome,
          text: verdict,
          actions: [
            { key: "rematch", label: "rematch", hint: "again, colours swapped", tone: "primary", onclick: rematch, disabled: busy },
            { key: "setup", label: "set up", hint: "a new match — change the seats or the clock first", onclick: setup, disabled: busy },
            { key: "analyse", label: "analyse", hint: "open this game in the study", onclick: analyse, disabled: busy || !$data.game },
            { key: "review", label: "review", hint: "put this away and look at the final position", onclick: review },
          ],
        }
      : waiting
        ? {
            label: "not started",
            title: bothBots ? `${name("white")} against ${name("black")}` : `${name(turn)} has ${turn}`,
            text: "the seats and the clock bake in at the first move",
            actions: [{ key: "start", label: "▶ start", hint: starting, tone: "primary", onclick: start, disabled: busy }],
          }
        : null,
  );

  const actions = $derived([
    ...(rewindable
      ? [
          { key: "back", icon: "‹", label: "back", hint: "a ply back · ←", onclick: back, disabled: busy || at === 0 },
          { key: "forward", icon: "›", label: "forward", hint: rewound ? "a ply on · →" : "already at the last move", onclick: forward, disabled: busy || !rewound },
        ]
      : []),
    { key: "new", icon: "+", label: "new", hint: "new match", onclick: () => fresh(), guarded: plies > 0 && !ended, disabled: busy },
    ...(waiting ? [{ key: "start", icon: "▶", label: "start", hint: starting, tone: "primary", onclick: start, disabled: busy }] : []),
    { key: "draw", icon: "½", label: "draw", hint: "offer a draw", onclick: offer, disabled: busy || ended },
    { key: "resign", icon: "⚑", label: "resign", hint: "resign the game", tone: "danger", onclick: resign, disabled: busy || ended },
  ]);
  const panels = $derived([
    { id: "setup", label: locked ? "match" : "setup" },
    { id: "moves", label: `moves ${plies}` },
  ]);
  const unanswered = $derived($data.marks?.filter((mark) => mark.kind !== "agent").length ?? 0);
  const byAgent = $derived($data.marks?.filter((mark) => mark.kind === "agent").length ?? 0);
  const abandoned = $derived($data.variations?.length ?? 0);

  // ← → walk a rewindable match; anything else is the shell's
  const keyed = (event) => {
    if (!rewindable) return;
    if (event.key === "ArrowLeft") return void back();
    if (event.key === "ArrowRight") return void forward();
    if (event.key === "Home") return void seek(0);
    if (event.key === "End") return void resume();
  };
</script>

<Shell
  {terminal}
  {daemon}
  active="board"
  {panels}
  bind:panel
  bind:open
  {note}
  {actions}
  {overlay}
  onflip={() => (flipped = !flipped)}
  onkey={keyed}>
  {#snippet upper()}
    <Seat
      at="top"
      name={name(top)}
      kind={seats[top].kind}
      option={option(top)}
      active={!ended && turn === top}
      clock={shown(top)}
      running={$data.clock?.running === top}
      lost={material.lost[top]}
      edge={material.edge[top]}
      white={top === "white"}
      kindHint="click to change who sits here"
      optionHint={optionHint(top)}
      onkind={locked || busy ? null : () => cycleKind(top)}
      onoption={locked || busy || !option(top) ? null : () => cycleOption(top)} />
  {/snippet}

  {#snippet board()}
    <Board {fen} {orientation} {lastMove} dests={myMove ? ($data.dests ?? {}) : {}} movable={myMove && !busy} check={Boolean($data.check)} onmove={move} />
  {/snippet}

  {#snippet lower()}
    <Seat
      at="bottom"
      name={name(orientation)}
      kind={seats[orientation].kind}
      option={option(orientation)}
      active={!ended && turn === orientation}
      clock={shown(orientation)}
      running={$data.clock?.running === orientation}
      lost={material.lost[orientation]}
      edge={material.edge[orientation]}
      white={orientation === "white"}
      kindHint="click to change who sits here"
      optionHint={optionHint(orientation)}
      onkind={locked || busy ? null : () => cycleKind(orientation)}
      onoption={locked || busy || !option(orientation) ? null : () => cycleOption(orientation)} />
  {/snippet}

  {#snippet body()}
    {#if panel === "moves"}
      <Moves
        sans={$data.sans ?? []}
        cursor={at}
        onseek={rewindable ? seek : null}
        meta={`${plies} plies${abandoned ? ` · ${abandoned} ${abandoned === 1 ? "line" : "lines"} left behind` : ""}${unanswered ? ` · ${unanswered} not answered legally` : ""}${byAgent ? ` · ${byAgent} played by the agent` : ""}`} />
    {:else}
      <Setup
        {seats}
        clock={$data.clock ?? null}
        {locked}
        {busy}
        {rewindable}
        onseat={seat}
        onclock={(clock) => fresh({ clock })}
        onrewindable={(rewind) => fresh({ rewind })} />
    {/if}
  {/snippet}
</Shell>
