<script>
  import { onMount } from "svelte";
  import Shell from "./kit/Shell.svelte";
  import Board from "./kit/Board.svelte";
  import Seat from "./kit/Seat.svelte";

  // riddles in five levels. the buffer carries the riddle, the line played, the tally and the
  // board's affordances; the view plays, nudges, reveals, skips — nothing here asks the wire
  // from an effect.
  const { terminal, daemon, mode, thread, buffer } = $props();
  const data = buffer.$data;

  const LEVELS = ["novice", "apprentice", "club", "expert", "master"];
  const ASKS = {
    novice: "under 1000 · one idea",
    apprentice: "1000–1400 · two moves deep",
    club: "1400–1800 · a sacrifice or a quiet move",
    expert: "1800–2200 · calculation",
    master: "2200 and up · the engine's taste",
  };
  const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
  const EMPTY = "8/8/8/8/8/8/8/8 w - - 0 1";

  let busy = $state(false);
  let fault = $state(null);
  let flipped = $state(false);
  let panel = $state("level");
  let open = $state(true);

  const call = (path, input) => mode.call.riddle[path](input);

  const puzzle = $derived($data.puzzle ?? null);
  const status = $derived($data.status ?? "idle");
  const solving = $derived(status === "solving");
  const over = $derived(status === "solved" || status === "failed");
  const side = $derived(puzzle?.side === "b" ? "black" : "white");
  const fen = $derived($data.fen ?? puzzle?.fen ?? EMPTY);
  const lastMove = $derived($data.played?.at?.(-1) ?? null);
  const level = $derived($data.level ?? "novice");
  const step = $derived(Math.floor(($data.played?.length ?? 0) / 2));
  const seen = $derived(($data.seen ?? []).length);

  // the piece the nudge points at, by name
  const hinted = $derived.by(() => {
    if (!$data.hint) return "";
    const [placement] = fen.split(" ");
    const file = $data.hint.charCodeAt(0) - 97;
    const rank = Number($data.hint[1]);
    const row = placement.split("/")[8 - rank] ?? "";
    let at = 0;
    for (const char of row) {
      if (/\d/.test(char)) at += Number(char);
      else {
        if (at === file) return GLYPH[char.toLowerCase()] ?? "";
        at++;
      }
    }
    return "";
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

  onMount(() => {
    // a buffer the nav minted empty asks for its first riddle
    if (!puzzle && status === "idle" && !seen) guard("open", () => call("open", { buffer: buffer.id, level, thread: thread?.id }));
  });

  // a riddle that ends opens the panel: the verdict and the way on live there
  const ended = (out) => {
    if (out?.status === "solved" || out?.status === "failed") {
      panel = "level";
      open = true;
    }
    return out;
  };
  const move = (uci) => guard("move", async () => ended(await call("move", { buffer: buffer.id, uci })));
  const next = (pick) => guard("next", () => call("next", { buffer: buffer.id, ...(pick && pick !== level && { level: pick }) }));
  const again = () => guard("again", () => call("again", { buffer: buffer.id }));
  const nudge = () => guard("nudge", () => call("hint", { buffer: buffer.id }));
  const reveal = () => guard("reveal", async () => ended(await call("reveal", { buffer: buffer.id })));

  // the line in SAN, numbered from the riddle's own position: "4. Qxf7#", "12… Rxe7 13. Qxe7"
  const numbered = (sans, from = 0) => {
    const [, turn = "w", , , , full = "1"] = (puzzle?.fen ?? "").split(" ");
    const out = [];
    sans.forEach((san, offset) => {
      const index = from + offset;
      const white = (turn === "w") === (index % 2 === 0);
      const number = Number(full) + Math.floor((index + (turn === "w" ? 0 : 1)) / 2);
      out.push(white ? `${number}. ${san}` : offset === 0 ? `${number}… ${san}` : san);
    });
    return out.join(" ");
  };
  const standing = (refutation) =>
    refutation.mate != null
      ? refutation.mate > 0
        ? `you still mate in ${refutation.mate}`
        : `you are mated in ${-refutation.mate}`
      : `${refutation.cp >= 0 ? "+" : "−"}${Math.abs(refutation.cp / 100).toFixed(1)} for you`;
  const stillWins = (refutation) => (refutation.mate != null ? refutation.mate > 0 : refutation.cp >= 300);

  // the verdict card: what happened to the move just played, and the controls that go on from it
  const verdict = $derived.by(() => {
    const mistake = $data.mistake ?? null;
    const whole = ($data.line ?? []).length ? `the line: ${numbered($data.line)}` : "";
    if (status === "failed" && $data.missed) {
      const details = [];
      if (mistake?.wanted) details.push(`you played ${numbered([mistake.san], mistake.ply - 1)} — the riddle wanted ${mistake.wanted}`);
      if (mistake?.refutation) {
        const reply = numbered(mistake.refutation.sans, mistake.ply);
        details.push(`${stillWins(mistake.refutation) ? "still good — " : ""}the engine's line: ${reply} — ${standing(mistake.refutation)}${stillWins(mistake.refutation) ? " — but the riddle's line is sharper" : ""}`);
      }
      if (whole) details.push(whole);
      details.push($data.replay ? "a replay — the tally stays" : "the streak resets");
      return { tone: "danger", headline: mistake ? `not ${mistake.san}` : "not this time", details };
    }
    if (status === "failed") return { tone: "warning", headline: "revealed", details: [whole, $data.replay ? "a replay — the tally stays" : "counted as failed · the streak resets"].filter(Boolean) };
    if (status === "solved") {
      const tally = $data.replay ? "a replay — the tally stays" : $data.hint ? "solved with a nudge — the streak stays at 0" : `streak ${$data.streak ?? 0}`;
      return { tone: "success", headline: "solved", details: [whole, tally].filter(Boolean) };
    }
    if (solving) {
      return {
        tone: $data.hint ? "warning" : "",
        headline: step === 0 ? `${side} to move · find the idea` : "yes — keep going, the reply is on the board",
        details: $data.hint ? [`the ${hinted} on ${$data.hint} moves. streak gone.`] : [],
      };
    }
    return { tone: "", headline: "no riddles at this level", details: ["is @chess/topography/puzzles kernelled?"] };
  });

  const controls = $derived(
    over
      ? [
          { key: "next", icon: "›", label: "next riddle", hint: "next at this level · n", tone: "primary", onclick: () => next() },
          { key: "again", icon: "↺", label: "try again", hint: "the same riddle from its start · r — a replay moves no tally", onclick: again },
        ]
      : solving
        ? [
            { key: "nudge", icon: "?", label: "nudge", hint: "shows the piece · costs the streak", onclick: nudge, disabled: Boolean($data.hint) },
            { key: "reveal", icon: "◉", label: "reveal", hint: "show the solution · counts as failed", tone: "danger", onclick: reveal },
            { key: "skip", icon: "›", label: "skip", hint: "skip · counts as failed", onclick: () => next() },
          ]
        : [{ key: "retry", icon: "↻", label: "retry", hint: "ask again", tone: "primary", onclick: () => next() }],
  );

  // on the board, once a wrong move ended it: the move played in red, the move wanted in green
  const tints = $derived.by(() => {
    if (status !== "failed" || !$data.missed) return {};
    const wanted = $data.solution?.[($data.played?.length ?? 1) - 1];
    const out = {};
    if (wanted) for (const square of [wanted.slice(0, 2), wanted.slice(2, 4)]) out[square] = "good";
    for (const square of [$data.missed.slice(0, 2), $data.missed.slice(2, 4)]) out[square] = "bad";
    return out;
  });

  // n goes on and r tries again, once the riddle is over
  const keys = (event) => {
    if (busy || !over) return;
    if (event.key === "n" || event.key === "Enter") next();
    if (event.key === "r") again();
  };

  const note = $derived(fault ? { by: "fault", text: fault, tone: "danger" } : null);
  const orientation = $derived(flipped ? (side === "white" ? "black" : "white") : side);
  const actions = $derived([
    { key: "again", icon: "↺", label: "again", hint: "replay this riddle · r", onclick: again, disabled: busy || !puzzle },
    ...controls.filter((control) => control.key !== "again").map((control) => ({ ...control, disabled: busy || control.disabled })),
  ]);
  const panels = [{ id: "level", label: "riddle" }];
</script>

<Shell {terminal} {daemon} active="riddle" {panels} bind:panel bind:open {note} {actions} onflip={() => (flipped = !flipped)} onkey={keys}>
  {#snippet upper()}
    <Seat at="top" name={puzzle ? `riddle ${seen}` : "riddle"} kind={puzzle ? `${puzzle.level} · ${puzzle.rating}` : ""} active={false} />
  {/snippet}

  {#snippet board()}
    <Board {fen} {orientation} {lastMove} dests={solving ? ($data.dests ?? {}) : {}} movable={solving && !busy} check={Boolean($data.check)} hint={solving ? ($data.hint ?? null) : null} {tints} onmove={move} />
  {/snippet}

  {#snippet lower()}
    <Seat at="bottom" name="you" kind={puzzle ? `${side} to move` : ""} active={solving} />
  {/snippet}

  {#snippet body()}
    <div class="verdict" class:success={verdict.tone === "success"} class:warning={verdict.tone === "warning"} class:danger={verdict.tone === "danger"}>
      <div class="headline">{verdict.headline}</div>
      {#each verdict.details as detail (detail)}<div class="detail">{detail}</div>{/each}
      <div class="controls">
        {#each controls as control (control.key)}
          <button class:primary={control.tone === "primary"} class:danger={control.tone === "danger"} title={control.hint} disabled={busy || control.disabled} onclick={control.onclick}><span class="icon">{control.icon}</span>{control.label}</button>
        {/each}
        {#if over && puzzle}<a href={`https://lichess.org/training/${puzzle.slug.replace("puzzle-", "")}`} target="_blank" rel="noreferrer" title="this riddle on lichess">lichess ↗</a>{/if}
      </div>
    </div>

    <div class="stack">
      <span class="label">level</span>
      <div class="segment">
        {#each LEVELS as name, index (name)}
          <button class:on={level === name} onclick={() => next(name)} disabled={busy} title={name}>{index + 1}</button>
        {/each}
      </div>
      <div class="prose">{level} · {ASKS[level]}</div>
    </div>

    <div class="tally">
      <div><div class="label">streak</div><div class="streak">{$data.streak ?? 0}</div></div>
      <div class="meta">solved {$data.solved ?? 0} · failed {$data.failed ?? 0} · nudged {$data.nudges ?? 0}</div>
    </div>

    {#if puzzle}
      <div class="themes">
        {#each puzzle.themes as theme (theme)}<span class="chip">{theme}</span>{/each}
      </div>
    {/if}
  {/snippet}
</Shell>

<style>
  .verdict {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--b0);
    border-left: 2px solid var(--b3);
    border-radius: 3px;
    background: var(--s2);
  }
  .verdict.success {
    border-left-color: var(--success);
  }
  .verdict.warning {
    border-left-color: var(--warning);
  }
  .verdict.danger {
    border-left-color: var(--danger);
  }
  .headline {
    font-family: var(--head);
    font-size: var(--font-size-base);
    font-weight: 600;
    line-height: 1.3;
    color: var(--t1);
  }
  .success .headline {
    color: var(--success);
  }
  .warning .headline {
    color: var(--warning);
  }
  .danger .headline {
    color: var(--danger);
  }
  .detail {
    font-family: var(--code);
    font-size: var(--font-size-xs);
    line-height: 1.55;
    color: var(--t2);
    text-wrap: pretty;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .controls button,
  .controls a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--b0);
    border-radius: 3px;
    background: transparent;
    color: var(--t2);
    font-family: var(--code);
    font-size: var(--font-size-xs);
    line-height: 1;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
  }
  .controls button:hover:not(:disabled),
  .controls a:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  .controls button.primary {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
  }
  .controls button.danger:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
  }
  .controls button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .controls a {
    margin-left: auto;
    color: var(--t3);
  }
  .segment button {
    padding: 7px 0;
    font-size: var(--font-size-sm);
  }
  .tally {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;
    align-items: end;
  }
  .tally .meta {
    line-height: 1.7;
  }
  .streak {
    font-family: var(--head);
    font-size: var(--font-size-3xl);
    font-weight: 600;
    line-height: 1.1;
    color: var(--primary);
  }
  .themes {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
</style>
