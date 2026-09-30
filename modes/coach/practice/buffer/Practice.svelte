<script>
  import { onMount } from "svelte";
  import Shell from "./kit/Shell.svelte";
  import Board from "./kit/Board.svelte";
  import Seat from "./kit/Seat.svelte";
  import Moves from "./kit/Moves.svelte";
  import Ladder from "./kit/Ladder.svelte";

  // agentic practice: the board is the buffer, the talk is the thread. the coach answers the
  // student's move through its tools on /practice/turn; the same thread shows here in the talk
  // panel and in anima's dock alike. nothing here asks the wire from an effect.
  const { terminal, daemon, mode, thread, buffer } = $props();
  const data = buffer.$data;

  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const STRENGTHS = ["gentle", "club", "strong"];
  const STILL = { subscribe: (fn) => (fn([]), () => {}) };
  const turns = thread?.$turns ?? STILL;

  let busy = $state(false);
  let fault = $state(null);
  let flipped = $state(false);
  let panel = $state("talk");
  let open = $state(true);
  let question = $state("");
  let thinking = $state(false);

  const call = (path, input) => mode.call.practice[path](input);

  const student = $derived($data.student ?? "white");
  const coach = $derived(student === "white" ? "black" : "white");
  const fen = $derived($data.fen ?? START);
  const status = $derived($data.status ?? "pending");
  const turn = $derived($data.turn ?? "white");
  const ended = $derived(status === "ended");
  const waiting = $derived(Boolean($data.waiting));
  const myMove = $derived(!ended && turn === student && !waiting);
  const orientation = $derived(flipped ? coach : student);
  const lastMove = $derived($data.moves?.at?.(-1) ?? null);
  const moves = $derived($data.moves ?? []);
  const pending = $derived(moves.length === 0 && !ended);
  const mine = (index) => (index % 2 === 0) === (student === "white");
  const myLast = $derived([...moves.keys()].reverse().find(mine) ?? null);
  const ladder = $derived(myLast == null ? null : ($data.ladders?.[String(myLast + 1)] ?? null));
  const lastNote = $derived(($data.notes ?? []).at(-1) ?? null);

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

  // the coach's turn streams on the thread; the board follows the buffer
  const drain = async (stream) => {
    thinking = true;
    try {
      for await (const _ of await stream);
    } finally {
      thinking = false;
    }
  };

  const fresh = (patch = {}) =>
    guard("new", async () => {
      await call("create", { buffer: buffer.id, student, strength: $data.strength ?? "club", ...patch, thread: thread?.id });
      await drain(call("turn", { buffer: buffer.id, thread: thread?.id }));
    });

  onMount(() => {
    // a buffer the nav minted empty becomes a game on first sight; the coach opens the talk
    if (!$data.fen) fresh();
  });

  const move = (uci) =>
    guard("move", async () => {
      await call("move", { buffer: buffer.id, uci });
      await drain(call("turn", { buffer: buffer.id, thread: thread?.id }));
    });
  const ask = () => {
    const text = question.trim();
    if (!text) return;
    question = "";
    panel = "talk";
    open = true;
    return guard("ask", () => drain(call("ask", { buffer: buffer.id, text, thread: thread?.id })));
  };
  const elo = () =>
    myLast == null
      ? null
      : guard("elo", async () => {
          panel = "elo";
          open = true;
          const found = await call("elo", { buffer: buffer.id });
          if (found && !found.ladder) throw new Error(found.message ?? "no ladder came back");
          return found;
        });
  // the coach's turn ended without a move — ask again
  const poke = () => guard("turn", () => drain(call("turn", { buffer: buffer.id, thread: thread?.id })));
  const stalled = $derived(waiting && !thinking && !busy && !ended);
  const resign = () => guard("resign", () => call("resign", { buffer: buffer.id }));
  const cycleStrength = () => fresh({ strength: STRENGTHS[(STRENGTHS.indexOf($data.strength ?? "club") + 1) % STRENGTHS.length] });
  const swapSides = () => fresh({ student: coach });

  const line = $derived(
    ended
      ? `${$data.result} · ${$data.reason}`
      : thinking || busy
        ? "coach is thinking"
        : stalled
          ? "coach has not moved yet — ▶ asks it again"
          : myMove
            ? `your move · ${student}${$data.check ? " · check" : ""}`
            : "coach to move",
  );
  const plyLabel = (ply) => `${Math.ceil(ply / 2)}${ply % 2 ? "." : "…"} ${$data.sans?.[ply - 1] ?? ""}`;

  // the talk, as the dock reads it: text parts speak, tool_use parts row up with their result
  const digest = (value) => {
    if (value == null) return "";
    if (typeof value === "string") return value.split("\n")[0].slice(0, 90);
    if (typeof value === "object") return digest(value.message ?? value.output ?? value.content ?? Object.values(value)[0]);
    return String(value).slice(0, 90);
  };
  const entries = $derived.by(() => {
    const results = new Map();
    for (const item of $turns ?? []) for (const part of item?.parts ?? []) if (part?.type === "tool_result") results.set(part.tool_use_id ?? part.id, part);
    const out = [];
    for (const item of $turns ?? []) {
      const parts = item?.parts ?? [];
      if (parts.length && parts.every((part) => part?.type === "tool_result")) continue;
      for (const part of parts) {
        if (part?.type === "text" && part.text?.trim()) out.push({ who: item.role === "user" ? "you" : "coach", text: part.text.trim() });
        if (part?.type === "tool_use") {
          const result = results.get(part.id);
          out.push({ who: "tool", name: part.name ?? "tool", text: result ? digest(result.output ?? result.content) : digest(part.input), failed: result?.condition === "ERROR" });
        }
      }
    }
    return out.slice(-12);
  });

  // the note: a fault, the result, a stall — else the coach's word on its last move, else the state
  const note = $derived(
    fault
      ? { by: "fault", text: fault, tone: "danger" }
      : ended
        ? { by: "result", text: line, tone: "primary" }
        : stalled
          ? { by: "coach", text: line, tone: "warning" }
          : lastNote
            ? { by: `coach · ${plyLabel(lastNote.ply)}`, text: lastNote.text }
            : { by: "practice", text: line },
  );
  const actions = $derived([
    { key: "new", icon: "+", label: "new", hint: "new practice game", onclick: () => fresh(), guarded: moves.length > 0 && !ended, disabled: busy },
    { key: "elo", icon: "≈", label: "elo of my move", hint: "which limited-strength engine plays your last move", tone: "primary", onclick: elo, disabled: busy || myLast == null },
    ...(stalled ? [{ key: "poke", icon: "▶", label: "coach, move", hint: "coach, move — ask the coach for its move again", tone: "primary", onclick: poke, disabled: busy }] : []),
    { key: "resign", icon: "⚑", label: "resign", hint: "resign the game", tone: "danger", onclick: resign, disabled: busy || ended },
  ]);
  const panels = $derived([
    { id: "talk", label: "talk" },
    { id: "moves", label: `moves ${moves.length}` },
    { id: "elo", label: "elo" },
  ]);
  const coachKind = $derived(`${$data.strength ?? "club"} · assisted`);
</script>

<Shell {terminal} {daemon} active="coach" {panels} bind:panel bind:open {note} {actions} onflip={() => (flipped = !flipped)}>
  {#snippet upper()}
    <Seat
      at="top"
      name={orientation === student ? "coach" : "you"}
      kind={orientation === student ? coachKind : "student"}
      option={orientation === student ? "" : student}
      active={!ended && turn === (orientation === student ? coach : student)}
      kindHint={orientation === student ? "click to change how hard the coach plays — a new game" : ""}
      optionHint="click to swap sides — a new game"
      onkind={orientation === student && pending ? cycleStrength : null}
      onoption={orientation !== student && pending ? swapSides : null} />
  {/snippet}

  {#snippet board()}
    <Board {fen} {orientation} {lastMove} dests={myMove ? ($data.dests ?? {}) : {}} movable={myMove && !busy} check={Boolean($data.check)} onmove={move} />
  {/snippet}

  {#snippet lower()}
    <Seat
      at="bottom"
      name={orientation === student ? "you" : "coach"}
      kind={orientation === student ? "student" : coachKind}
      option={orientation === student ? student : ""}
      active={!ended && turn === orientation}
      kindHint={orientation === student ? "" : "click to change how hard the coach plays — a new game"}
      optionHint="click to swap sides — a new game"
      onkind={orientation !== student && pending ? cycleStrength : null}
      onoption={orientation === student && pending ? swapSides : null} />
  {/snippet}

  {#snippet body()}
    {#if panel === "moves"}
      <Moves sans={$data.sans ?? []} cursor={moves.length} meta={`${moves.length} plies`} />
    {:else if panel === "elo"}
      <Ladder {ladder} label="elo of my move" move={myLast == null ? "" : plyLabel(myLast + 1)} empty="play a move, then ≈ prices it against the limited-strength ladder." />
    {:else}
      {#each entries as entry, index (index)}
        {#if entry.who === "tool"}
          <div class="tool" class:failed={entry.failed}><span class="primary">{entry.name}</span><span>{entry.text}</span></div>
        {:else if entry.who === "coach"}
          <div class="said">{entry.text}</div>
        {:else}
          <div class="asked">{entry.text}</div>
        {/if}
      {/each}
      {#if thinking}<span class="pulse"></span>{/if}
      {#if !entries.length && !thinking}<div class="meta">the coach talks here — it plays {coach} through its tools</div>{/if}
    {/if}
  {/snippet}

  {#snippet foot()}
    {#if panel === "talk"}
      <div class="ask">
        <input bind:value={question} placeholder="ask the coach…" onkeydown={(event) => event.key === "Enter" && ask()} disabled={busy} />
        <button onclick={ask} disabled={busy || !question.trim()}>send</button>
      </div>
    {/if}
  {/snippet}
</Shell>

<style>
  .tool {
    display: flex;
    gap: 7px;
    align-items: baseline;
    flex-wrap: wrap;
    align-self: flex-start;
    padding: 4px 7px;
    border: 1px dashed var(--b0);
    border-radius: 3px;
    font-family: var(--code);
    font-size: var(--font-size-2xs);
    color: var(--t3);
  }
  .tool.failed {
    border-color: var(--danger);
  }
  .said {
    padding-left: 9px;
    border-left: 2px solid var(--b3);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--t1);
    text-wrap: pretty;
  }
  .asked {
    align-self: flex-end;
    max-width: 88%;
    text-align: right;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--t2);
  }
  .ask {
    flex: none;
    display: flex;
    border-top: 1px solid var(--b0);
    background: var(--s2);
  }
  .ask input {
    flex: 1;
    min-width: 0;
    padding: 9px 11px;
    border: none;
    background: transparent;
    color: var(--t1);
    font-family: var(--sans);
    font-size: var(--font-size-sm);
    outline: none;
  }
  .ask button {
    padding: 0 12px;
    border: none;
    border-left: 1px solid var(--b0);
    background: transparent;
    color: var(--primary);
    font-family: var(--code);
    font-size: var(--font-size-xs);
    cursor: pointer;
  }
  .ask button:hover:not(:disabled) {
    background: var(--s3);
  }
  .ask button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
