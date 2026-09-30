<script>
  import { onDestroy, onMount } from "svelte";
  import Theme from "./Theme.svelte";
  import Nav from "./Nav.svelte";
  import { FLOOR, place } from "./layout.js";
  import { play, remember, wanted } from "./sound.js";

  // the frame every chess buffer wears: the nav, then a board column — seat · board · seat, with a
  // rail of tools and actions on its right edge — or under it as a bar once the buffer is
  // phone-narrow, where a side rail costs the board a tenth of its width — and a dock of panels;
  // or, with no board, a plain page (the library). the dock goes wherever it leaves the bigger board: beside it on landscape,
  // under it on portrait, and over the board's foot as a sheet once the buffer is phone-narrow.
  // every size is the buffer's own, measured — never the window's; the Frame may be one split of it.
  // `overlay` puts a card over the board — { label, title, text, actions } — for what the board cannot
  // say itself: a match waiting for its start, a game that has ended and what comes next.
  let {
    terminal,
    daemon,
    active,
    panels = [],
    panel = $bindable(null),
    open = $bindable(true),
    note = null,
    actions = [],
    evaluation = null,
    overlay = null,
    onflip = null,
    onkey = null,
    upper = null,
    board = null,
    lower = null,
    body = null,
    foot = null,
    children = null,
  } = $props();

  const ARMED = 4000;

  let root = $state(null);
  let width = $state(1200);
  let height = $state(800);
  let dockWidth = $state(300);
  let dockHeight = $state(320);
  // the stage's own box, measured: the board's square is the larger one that fits it. measured,
  // not queried — `cqh` against a flex-sized container came out short on iOS, leaving a gap at
  // the sides and cutting the board's foot; a number in px cannot
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let armed = $state(null);
  // sound on move: the browser remembers; read on mount, so the server renders it on
  let sound = $state(true);
  let timer = null;
  let release = null;

  const docked = $derived(Boolean(board) && panels.length > 0);
  const shown = $derived(docked && open);
  const layout = $derived(place({ width, height, dockWidth, dockHeight, shown }));
  const cover = $derived(layout.cover);
  const rail = $derived(layout.rail);
  const bar = $derived(layout.bar);
  const narrow = $derived(layout.narrow);
  const pad = $derived(layout.pad);
  const lift = $derived(layout.lift);
  const edge = $derived(stageWidth && stageHeight ? Math.max(0, Math.min(stageWidth - 2 * pad, stageHeight - 2 * pad - lift)) : null);

  // a guarded action arms on the first press and fires on the second, within ARMED ms
  const press = (action) => {
    if (action.disabled) return;
    if (!action.guarded) return action.onclick();
    clearTimeout(timer);
    if (armed === action.key) {
      armed = null;
      return action.onclick();
    }
    armed = action.key;
    timer = setTimeout(() => armed === action.key && (armed = null), ARMED);
  };

  const resize = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const across = !narrow;
    const x = event.clientX;
    const y = event.clientY;
    const w = dockWidth;
    const h = dockHeight;
    const follow = (moved) => {
      if (across) dockWidth = Math.max(220, Math.min(Math.max(260, width - 360), w + (x - moved.clientX)));
      else dockHeight = Math.max(120, Math.min(Math.max(160, height - FLOOR), h + (y - moved.clientY)));
    };
    release = () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      release = null;
    };
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  };

  // the keys belong to this buffer once it holds the focus — a click anywhere in it gives it
  const keys = (event) => {
    if (!root?.contains(document.activeElement)) return;
    if (/^(input|textarea|select)$/i.test(event.target?.tagName ?? "")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "f" && onflip) return onflip();
    if (event.key === "p" && docked) return void (open = !open);
    if (event.key === "s") return toggleSound();
    onkey?.(event);
  };

  onMount(() => (sound = wanted()));
  onDestroy(() => {
    clearTimeout(timer);
    release?.();
  });

  // flipping it on plays the sound once — inside the gesture, so the context may resume
  const toggleSound = () => {
    sound = !sound;
    remember(sound);
    if (sound) play();
  };
</script>

<svelte:window onkeydown={keys} />

<div class="chess" tabindex="-1" bind:this={root} bind:clientWidth={width} bind:clientHeight={height}>
  <Theme />
  <Nav {terminal} {daemon} {active} {narrow} />
  {#snippet tools()}
    {#if onflip}<button title="flip the board · f" onclick={onflip}>⇅</button>{/if}
    {#if docked}<button class:on={shown} title={shown ? "hide the panel · p" : "show the panel · p"} onclick={() => (open = !open)}>☰</button>{/if}
    <button class:on={sound} title={sound ? "sound on move · s — turn it off" : "sound on move · s — turn it on"} onclick={toggleSound}>♪</button>
    <span class="gap"></span>
    {#each actions as action (action.key)}
      <button
        class:primary={action.tone === "primary"}
        class:danger={action.tone === "danger"}
        class:armed={armed === action.key}
        title={armed === action.key ? `${action.label}? — press again; this discards the game in the buffer` : action.guarded ? `${action.hint} · asks twice` : action.hint}
        disabled={action.disabled}
        onclick={() => press(action)}>{armed === action.key ? "?" : action.icon}</button>
    {/each}
  {/snippet}
  {#if board}
    <div class="main" class:stacked={narrow}>
      <div class="table">
        {@render upper?.()}
        <div class="arena">
          {#if evaluation != null}
            <div class="evalbar"><div class="white" style:height="{evaluation}%"></div></div>
          {/if}
          <div class="stage" style:padding="{pad}px {pad}px {pad + lift}px" bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}>
            <div class="square" style:width={edge == null ? null : `${edge}px`} style:height={edge == null ? null : `${edge}px`}>
              {@render board()}
              {#if overlay}
                <div class="overlay" role="dialog" aria-label={overlay.label ?? overlay.title}>
                  <div class="card">
                    {#if overlay.label}<div class="label">{overlay.label}</div>{/if}
                    <div class="figure">{overlay.title}</div>
                    {#if overlay.text}<div class="prose">{overlay.text}</div>{/if}
                    {#if overlay.actions?.length}
                      <div class="choices">
                        {#each overlay.actions as action (action.key)}
                          <button
                            class:primary={action.tone === "primary"}
                            class:danger={action.tone === "danger"}
                            title={action.hint}
                            disabled={action.disabled}
                            onclick={() => press(action)}>{action.label}</button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </div>
          {#if !cover}
            <div class="rail" style:width="{rail}px">{@render tools()}</div>
          {/if}
        </div>
        {@render lower?.()}
      </div>

      {#if shown}
        <aside class="dock" class:side={!narrow} class:under={narrow} class:cover style:width={narrow ? null : `${dockWidth}px`} style:height={narrow ? `${dockHeight}px` : null} style:bottom={cover ? `${bar}px` : null}>
          <div class="handle" title="drag to resize the panel" onpointerdown={resize}><span class="pill"></span></div>
          <!-- the tab strip first, so its rule continues the seat row's rule across the dock; the note sits under it -->
          <div class="tabs">
            {#each panels as item (item.id)}
              <button class:active={panel === item.id} onclick={() => (panel = item.id)}>{item.label}</button>
            {/each}
            <button class="close" title="hide the panel · p" onclick={() => (open = false)}>✕</button>
          </div>
          {#if note}
            <div class="note">
              <span class="dot" class:primary={note.tone === "primary"} class:success={note.tone === "success"} class:warning={note.tone === "warning"} class:danger={note.tone === "danger"} class:secondary={note.tone === "secondary"}></span>
              {#if note.by}<span class="by">{note.by}</span>{/if}
              <span class="said">{note.text}</span>
            </div>
          {/if}
          <div class="body">{@render body?.()}</div>
          {@render foot?.()}
        </aside>
      {/if}

      {#if cover}
        <div class="rail bar touch" style:height="{bar}px">{@render tools()}</div>
      {/if}
    </div>
  {:else}
    {@render children?.()}
  {/if}
</div>

<style>
  .main {
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    align-items: stretch;
  }
  .main.stacked {
    flex-direction: column;
  }
  .table {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .arena {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }
  .evalbar {
    width: 18px;
    flex: none;
    border-right: 1px solid var(--b0);
    background: var(--pb);
    position: relative;
    overflow: hidden;
  }
  .evalbar .white {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--pw);
    transition: height 0.4s;
  }
  .stage {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    box-sizing: border-box;
    overflow: hidden;
  }
  /* until measured (the server's render), the square takes the width; measured, it takes px */
  .square {
    width: 100%;
    aspect-ratio: 1;
    max-height: 100%;
    margin: auto;
    position: relative;
  }
  /* the card over the board: under the board's own promotion picker, over its squares */
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    padding: 6%;
    box-sizing: border-box;
    background: color-mix(in srgb, var(--s1) 45%, transparent);
  }
  .card {
    max-width: 100%;
    max-height: 100%;
    overflow: auto;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 18px;
    border: 1px solid var(--b2);
    border-radius: 6px;
    background: var(--s1);
    box-shadow: 0 18px 40px -12px var(--shadow);
    text-align: center;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 6px;
  }
  .choices button {
    padding: 7px 13px;
    border: 1px solid var(--b0);
    border-radius: 3px;
    background: transparent;
    color: var(--t2);
    font-family: var(--code);
    font-size: var(--font-size-sm);
    white-space: nowrap;
    cursor: pointer;
  }
  .choices button:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }
  .choices button.primary {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, transparent);
  }
  .choices button.danger:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
  }
  .choices button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .rail {
    flex: none;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    border-left: 1px solid var(--b0);
    background: var(--s2);
  }
  .rail button {
    width: 26px;
    height: 26px;
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--b0);
    border-radius: 3px;
    background: transparent;
    color: var(--t2);
    font-size: var(--font-size-sm);
    line-height: 1;
    cursor: pointer;
  }
  /* under the board, the rail is a row: the tools first, then the actions pushed to the far end */
  .rail.bar {
    flex-direction: row;
    padding: 0 8px;
    border-left: none;
    border-top: 1px solid var(--b0);
  }
  .rail.touch button {
    width: 38px;
    height: 38px;
    font-size: var(--font-size-base);
  }
  .rail button:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }
  .rail button.on {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, transparent);
  }
  .rail button.primary {
    color: var(--primary);
  }
  .rail button.danger:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
    background: var(--s3);
  }
  .rail button.armed,
  .rail button.armed:hover:not(:disabled) {
    border-color: var(--warning);
    color: var(--warning);
  }
  .rail button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .gap {
    flex: 1;
    min-width: 6px;
    min-height: 6px;
  }
  /* no overflow clip here: the resize handle straddles the dock's edge, half of it outside */
  .dock {
    position: relative;
    z-index: 4;
    flex: none;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: var(--s1);
  }
  .dock.side {
    border-left: 1px solid var(--b0);
  }
  .dock.under {
    border-top: 1px solid var(--b0);
  }
  .dock.cover {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    box-shadow: 0 -14px 34px -10px var(--shadow);
  }
  .handle {
    position: absolute;
    z-index: 6;
    display: grid;
    place-items: center;
    touch-action: none;
  }
  .side .handle {
    top: 0;
    bottom: 0;
    left: -4px;
    width: 9px;
    cursor: col-resize;
  }
  .under .handle {
    left: 0;
    right: 0;
    top: -4px;
    height: 9px;
    cursor: row-resize;
  }
  .pill {
    border-radius: 3px;
    background: var(--b3);
    opacity: 0.55;
  }
  .side .pill {
    width: 3px;
    height: 38px;
  }
  .under .pill {
    width: 38px;
    height: 3px;
  }
  .note {
    flex: none;
    box-sizing: border-box;
    min-height: 34px;
    display: flex;
    align-items: baseline;
    gap: 7px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--b0);
    background: var(--s2);
    font-family: var(--code);
    font-size: var(--font-size-xs);
    line-height: 1.45;
  }
  .note .dot {
    width: 5px;
    height: 5px;
    flex: none;
    border-radius: 50%;
    background: var(--b3);
  }
  .note .dot.primary { background: var(--primary); }
  .note .dot.success { background: var(--success); }
  .note .dot.warning { background: var(--warning); }
  .note .dot.danger { background: var(--danger); }
  .note .dot.secondary { background: var(--secondary); }
  .note .by {
    flex: none;
    color: var(--t3);
  }
  .note .said {
    min-width: 0;
    color: var(--t2);
    text-wrap: pretty;
  }
  /* the seat row's height, border inside: the two rules meet at the dock's edge */
  .tabs {
    flex: none;
    display: flex;
    align-items: stretch;
    height: 34px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--b0);
    background: var(--s2);
  }
  .tabs button {
    padding: 0 11px;
    border: none;
    border-right: 1px solid var(--b0);
    background: transparent;
    color: var(--t3);
    font-family: var(--code);
    font-size: var(--font-size-xs);
    letter-spacing: 0.05em;
    white-space: nowrap;
    cursor: pointer;
  }
  .tabs button:hover {
    color: var(--t1);
  }
  .tabs button.active {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
  }
  .tabs .close {
    margin-left: auto;
    border-right: none;
    border-left: 1px solid var(--b0);
    font-size: var(--font-size-sm);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 13px 14px;
    overflow: auto;
  }
</style>
