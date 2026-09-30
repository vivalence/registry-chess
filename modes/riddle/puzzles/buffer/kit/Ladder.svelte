<script>
  // the elo panel: which limited-strength search plays a move — the domain's /position/elo answer,
  // rung by rung. without a ladder the panel says how to get one.
  const { ladder = null, label = "elo of this move", move = "", empty = "" } = $props();

  const top = $derived(ladder != null && (ladder.elo === "full" || ladder.unanimous));
  const value = $derived(!ladder ? "" : top ? "2800+" : String(ladder.elo ?? "—"));
  const strong = $derived(top || (typeof ladder?.elo === "number" && ladder.elo >= 2400));
  const weak = $derived(ladder != null && !top && (ladder.elo == null || ladder.elo < 1600));
  const searches = $derived((ladder?.rungs ?? []).reduce((sum, rung) => sum + (rung.plays?.length ?? 1), 0));
</script>

{#if ladder}
  <div class="ladder">
    <span class="label">{label}{move ? ` · ${move}` : ""}</span>
    <div class="verdict">
      <span class="value" class:success={strong} class:danger={weak}>{value}</span>
      <span class="said">{ladder.verdict}</span>
    </div>
    <div class="bands" style:grid-template-columns="repeat({ladder.rungs.length}, 1fr)">
      {#each ladder.rungs as rung (rung.elo)}
        <div class="band" class:agrees={rung.agrees}>
          <span class="rung">{rung.elo}</span>
          <span class="san">{rung.san}</span>
          {#if rung.share > 0 && rung.share < 1}<span class="rung">{Math.round(rung.share * rung.plays.length)}/{rung.plays.length}</span>{/if}
        </div>
      {/each}
    </div>
    <div class="sentence">{ladder.sentence}</div>
    {#if !ladder.settled}<div class="meta">the strengths split here — several moves are equal, so the number is a sample</div>{/if}
    <div class="meta">stockfish · uci_limitstrength · {searches} searches · {ladder.hits}/{ladder.rungs.length} cached</div>
  </div>
{:else if empty}
  <div class="empty">{empty}</div>
{/if}

<style>
  .ladder {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .verdict {
    display: flex;
    align-items: baseline;
    gap: 9px;
    flex-wrap: wrap;
  }
  .value {
    font-family: var(--head);
    font-size: var(--font-size-3xl);
    font-weight: 600;
    line-height: 1.1;
    color: var(--t1);
  }
  .value.success {
    color: var(--success);
  }
  .value.danger {
    color: var(--danger);
  }
  .said {
    font-size: var(--font-size-sm);
    color: var(--t2);
  }
  .bands {
    display: grid;
    gap: 1px;
    border: 1px solid var(--b0);
    border-radius: 3px;
    overflow: hidden;
    background: var(--b0);
  }
  .band {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 7px 2px;
    background: var(--s2);
    text-align: center;
    font-family: var(--code);
    min-width: 0;
  }
  .band.agrees {
    background: color-mix(in srgb, var(--primary) 8%, var(--s2));
  }
  .rung {
    font-size: var(--font-size-2xs);
    color: var(--t3);
  }
  .san {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--t2);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .agrees .san {
    color: var(--primary);
  }
  .sentence {
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--t2);
    text-wrap: pretty;
  }
  .empty {
    font-size: var(--font-size-sm);
    line-height: 1.55;
    color: var(--t3);
    text-wrap: pretty;
  }
</style>
