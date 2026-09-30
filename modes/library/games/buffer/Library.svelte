<script>
  import { onMount } from "svelte";
  import Shell from "./kit/Shell.svelte";
  import { open, show, TABS } from "./kit/open.js";

  // the corpus in a list. the buffer carries the rows under a filter; import adds to the corpus
  // and refreshes; opening a game is the study's business — a fresh study buffer on this daemon,
  // loaded with the game.
  const { terminal, daemon, mode, thread, buffer } = $props();
  const data = buffer.$data;

  const FILTERS = ["all", "1-0", "0-1", "½-½", "analysed", "eco.A", "eco.B", "eco.C", "eco.D", "eco.E"];
  const STUDY = TABS.find((tab) => tab.type === "study");

  let busy = $state(false);
  let fault = $state(null);
  let pgn = $state("");
  let opening = $state(null);

  const call = (path, input) => mode.call.library[path](input);

  const filter = $derived($data.filter ?? "all");
  const games = $derived($data.games ?? []);

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

  const list = (pick) => guard("list", () => call("list", { buffer: buffer.id, ...(pick && { filter: pick }), thread: thread?.id }));
  const bring = () =>
    pgn.trim()
      ? guard("import", async () => {
          const landed = await call("import", { buffer: buffer.id, pgn });
          if (landed?.tone === "success") pgn = "";
          return landed;
        })
      : null;

  onMount(() => {
    // a buffer the nav minted empty lists on first sight
    if (!$data.games) list();
  });

  const openGame = (game) =>
    guard("open", async () => {
      opening = game.id;
      try {
        const held = await open(terminal, daemon, STUDY, { fresh: true, show: false });
        await held.mode.call.analysis.load({ buffer: held.buffer.id, game: game.id, thread: held.thread.id });
        show(terminal, held);
      } finally {
        opening = null;
      }
    });

  const label = (name) => (name === "analysed" ? "analysed" : name.startsWith("eco.") ? `opening.${name}` : name === "all" ? "all" : `result.${name}`);
  const line = $derived(!$data.games ? "reading the corpus" : games.length ? `${games.length} of ${$data.count ?? games.length} games` : $data.count ? "nothing under this filter" : "no games yet — paste a PGN, play one, or practise");
  const held = $derived(games.filter((game) => game.analysed).length);
</script>

<Shell {terminal} {daemon} active="library">
  <div class="shelf">
    <div class="tools">
      <div class="chips">
        {#each FILTERS as name (name)}
          <button class="chip" class:on={filter === name} onclick={() => list(name)} disabled={busy}>{label(name)}</button>
        {/each}
      </div>
      <div class="field import">
        <textarea bind:value={pgn} rows="1" placeholder="paste a PGN · ⌘⏎ imports" onkeydown={(event) => event.key === "Enter" && (event.metaKey || event.ctrlKey) && bring()}></textarea>
        <button onclick={bring} disabled={busy || !pgn.trim()}>import</button>
      </div>
    </div>

    {#if $data.sentence}
      <div class="sentence" class:success={$data.tone === "success"} class:warning={$data.tone === "warning"} class:danger={$data.tone === "danger"}>{$data.sentence}</div>
    {/if}

    <div class="rows">
      {#each games as game (game.id)}
        <div class="game" class:busy={opening === game.id} onclick={() => !busy && openGame(game)} role="button" tabindex="0" onkeydown={(event) => event.key === "Enter" && !busy && openGame(game)}>
          <span class="players">{game.players}</span>
          <span class="result">{game.result}</span>
          <span class="opening"><span class="eco">{game.eco ?? ""} </span>{game.opening ?? (game.event ?? "")}</span>
          <span class="meta">{game.date ?? ""}</span>
          <span class="meta">{game.plies}</span>
          <span class="action primary">{opening === game.id ? "opening…" : game.analysed ? "analysed · open →" : "open →"}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="status">
    <span class="line">{line}{held ? ` · ${held} analysed` : ""}</span>
    <button onclick={() => list("all")} disabled={busy || filter === "all"} title="clear the filter"><span class="icon">↺</span>all</button>
  </div>
  <div class="hint">
    {#if fault}
      <span class="dot"></span><span class="fault">{fault}</span>
    {:else}
      <span>paste a PGN to import · click a game to study it</span>
    {/if}
  </div>
</Shell>

<style>
  .shelf {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 18px;
    overflow: auto;
  }
  .tools {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: center;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .import {
    margin-left: auto;
    flex: 1 1 300px;
    max-width: 520px;
  }
  .import textarea {
    min-height: 34px;
    padding: 8px 11px;
    font-size: var(--font-size-sm);
    resize: vertical;
  }
  .sentence {
    font-family: var(--code);
    font-size: var(--font-size-sm);
    color: var(--t3);
  }
  .rows {
    border-top: 1px solid var(--b0);
  }
  .game {
    display: grid;
    grid-template-columns: minmax(160px, 2fr) 48px minmax(150px, 2fr) 56px 46px minmax(90px, 1fr);
    gap: 12px;
    align-items: center;
    padding: 11px 4px;
    border-bottom: 1px solid var(--b2);
    font-size: var(--font-size-sm);
    color: var(--t2);
    cursor: pointer;
  }
  .game:hover,
  .game.busy {
    background: var(--s2);
  }
  .players {
    color: var(--t1);
    font-weight: 500;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .result {
    font-family: var(--code);
    color: var(--t1);
  }
  .opening {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .eco {
    font-family: var(--code);
    color: var(--t3);
  }
  .action {
    font-family: var(--code);
    font-size: var(--font-size-xs);
    text-align: right;
  }
  .status {
    display: flex;
    align-items: stretch;
    gap: 12px;
    height: 46px;
    flex: none;
    padding: 0 0 0 10px;
    border-top: 1px solid var(--b0);
    background: var(--s2);
  }
  .status .line {
    align-self: center;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--code);
    font-size: var(--font-size-sm);
    color: var(--t3);
  }
  .status button {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border: none;
    border-left: 1px solid var(--b0);
    background: transparent;
    color: var(--t2);
    font-family: var(--code);
    font-size: var(--font-size-sm);
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }
  .status button:hover:not(:disabled) {
    background: var(--s3);
    color: var(--primary);
  }
  .status button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    flex: none;
    padding: 0 10px;
    overflow: hidden;
    border-top: 1px solid var(--b2);
    background: var(--s1);
    font-family: var(--code);
    font-size: var(--font-size-xs);
    color: var(--t3);
    white-space: nowrap;
  }
  .hint .dot {
    width: 5px;
    height: 5px;
    flex: none;
    border-radius: 50%;
    background: var(--danger);
  }
  .hint .fault {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--font-size-xs);
  }
  @media (max-width: 720px) {
    .game {
      grid-template-columns: 1fr 48px;
    }
    .opening,
    .game > .meta,
    .action {
      display: none;
    }
  }
</style>
