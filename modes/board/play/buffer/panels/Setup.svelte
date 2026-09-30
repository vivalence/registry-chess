<script>
  // the match panel: who sits on each side, how strong the engine plays, the time control. the
  // first move bakes all of it into the game — after it the same values show as they were played.
  // `onseat(side, occupant)`, `onclock(clock | null)` and `onrewindable(boolean)` go to the
  // match's doors — the last one mints a new match, so it locks with the rest at the first move.
  const { seats, clock = null, locked = false, busy = false, rewindable = false, onseat, onclock, onrewindable } = $props();

  // stockfish's UCI_Elo runs 1320…3190; past the top the engine plays unlimited ("max")
  const FLOOR = 1320;
  const CEILING = 3190;
  const STEP = 50;
  const KINDS = [
    ["user", "you"],
    ["engine", "stockfish"],
    ["hallucinator", "a model"],
  ];
  const PRESETS = [1320, 1600, 2000, 2400, 2800, null];
  const CONTROLS = [
    [1, 0],
    [3, 2],
    [5, 0],
    [10, 0],
    [15, 10],
    [0, 0],
  ];

  const band = (elo) => (elo == null ? "full strength" : elo < 1400 ? "novice" : elo < 1800 ? "club" : elo < 2200 ? "strong" : "expert");
  const stepped = (elo, delta) => {
    const next = (elo ?? CEILING + 10) + delta;
    return next > CEILING ? null : Math.max(FLOOR, next);
  };
  const occupant = (side, kind) =>
    kind === seats[side].kind ? seats[side] : kind === "user" ? { kind } : kind === "engine" ? { kind, elo: 1600, movetime: 600 } : { kind, assisted: true };
  const strength = (side, elo) => onseat(side, { ...seats[side], elo: elo ?? undefined });

  const minutes = $derived(clock ? Math.round(clock.initial / 60) : 0);
  const increment = $derived(clock ? (clock.increment ?? 0) : 0);
  const control = (base, extra) => onclock(base > 0 ? { initial: base * 60, increment: extra } : null);
  const speed = $derived(!minutes ? "no clock" : minutes < 3 ? "bullet" : minutes < 10 ? "blitz" : minutes < 30 ? "rapid" : "classical");
</script>

{#each ["white", "black"] as side (side)}
  {@const held = seats[side]}
  <div class="stack">
    <span class="label seat"><span class="piece" class:white={side === "white"} class:black={side === "black"}></span>{side}</span>
    <div class="segment">
      {#each KINDS.filter(([kind]) => !locked || kind === held.kind) as [kind, label] (kind)}
        <button class:on={held.kind === kind} disabled={locked || busy} title={locked ? "baked in at the first move" : `seat ${label} as ${side}`} onclick={() => held.kind !== kind && onseat(side, occupant(side, kind))}>{label}</button>
      {/each}
    </div>
    {#if held.kind === "engine"}
      <div class="line">
        {#if !locked}<button class="step" title="50 elo weaker" disabled={busy || held.elo === FLOOR} onclick={() => strength(side, stepped(held.elo, -STEP))}>−</button>{/if}
        <span class="value"><span class="number">{held.elo ?? "max"}</span><span class="meta">{band(held.elo)}</span></span>
        {#if !locked}<button class="step" title="50 elo stronger" disabled={busy || held.elo == null} onclick={() => strength(side, stepped(held.elo, STEP))}>+</button>{/if}
      </div>
      {#if !locked}
        <div class="presets">
          {#each PRESETS as elo (elo ?? "max")}
            <button class="chip" class:on={(held.elo ?? null) === elo} disabled={busy} onclick={() => strength(side, elo)}>{elo ?? "max"}</button>
          {/each}
        </div>
      {/if}
    {:else if held.kind === "hallucinator"}
      <div class="presets">
        {#each [[true, "assisted"], [false, "unassisted"]] as [assisted, label] (label)}
          <button class="chip" class:on={Boolean(held.assisted) === assisted} disabled={locked || busy} title={assisted ? "the model sees the engine's lines before it chooses" : "the model plays on its own"} onclick={() => onseat(side, { ...held, assisted })}>{label}</button>
        {/each}
      </div>
    {/if}
  </div>
{/each}

<div class="stack control">
  <span class="label">time control</span>
  <span class="value"><span class="number big">{minutes ? `${minutes}+${increment}` : "unlimited"}</span><span class="meta">{speed}</span></span>
  {#if !locked}
    <div class="presets">
      {#each CONTROLS as [base, extra] (base)}
        <button class="chip" class:on={minutes === base && (base === 0 || increment === extra)} disabled={busy} onclick={() => control(base, extra)}>{base ? `${base}+${extra}` : "unlimited"}</button>
      {/each}
    </div>
    <div class="line">
      <span class="name">minutes each</span>
      <button class="step" disabled={busy || minutes === 0} onclick={() => control(minutes - 1, increment)}>−</button>
      <span class="count">{minutes}</span>
      <button class="step" disabled={busy || minutes >= 60} onclick={() => control(minutes + 1, increment)}>+</button>
    </div>
    <div class="line">
      <span class="name">increment, seconds</span>
      <button class="step" disabled={busy || !minutes || increment === 0} onclick={() => control(minutes, increment - 1)}>−</button>
      <span class="count">{increment}</span>
      <button class="step" disabled={busy || !minutes || increment >= 30} onclick={() => control(minutes, increment + 1)}>+</button>
    </div>
  {/if}
</div>

<div class="stack">
  <button
    class="chip toggle"
    class:on={rewindable}
    disabled={locked || busy}
    title={locked
      ? `this match ${rewindable ? "is" : "is not"} rewindable — baked in at the first move`
      : rewindable
        ? "on — ‹ › walk the game back, and a move from there forks it; the line left behind is kept with the record. click to turn off"
        : "off — every move stands. click to let the game be walked back and played on from an earlier move"}
    onclick={() => onrewindable(!rewindable)}>rewindable</button>
</div>

<div class="meta">{locked ? "baked in at the first move · + new opens the setup again" : "the first move bakes the seats, the clock and rewindable into the game"}</div>

<style>
  /* a chip on its own is the whole control: it names the thing and its border says on or off */
  .toggle {
    align-self: flex-start;
    padding: 5px 11px;
    font-size: var(--font-size-sm);
    letter-spacing: 0.05em;
  }
  .seat {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .piece {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    border: 1px solid var(--b3);
  }
  .piece.white {
    background: var(--pw);
  }
  .piece.black {
    background: var(--pb);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .value {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .number {
    font-family: var(--head);
    font-size: var(--font-size-lg);
    font-weight: 600;
    line-height: 1.1;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .number.big {
    font-size: var(--font-size-xl);
  }
  .presets {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .control {
    border-top: 1px solid var(--b2);
    padding-top: 12px;
  }
  .name {
    flex: 1;
    font-family: var(--code);
    font-size: var(--font-size-xs);
    color: var(--t2);
  }
  .count {
    width: 34px;
    text-align: center;
    font-family: var(--code);
    font-size: var(--font-size-sm);
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
</style>
