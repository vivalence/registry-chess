<script>
  // one seat row on the board's edge: the turn dot, a name, the kind chip, an option chip, what
  // this seat has lost, the clock. `at` is the edge it sits on — the top row rules its foot, the
  // bottom row its head. chips are buttons only when the caller hands a handler.
  // `lost` is this seat's own captured pieces as glyphs; `edge` its material lead, shown only
  // when it leads. the pile gives up its width before the name or the clock do.
  const { name, kind = "", option = "", active = false, clock = "", running = false, kindHint = "", optionHint = "", onkind = null, onoption = null, at = "bottom", lost = [], edge = 0, white = false } = $props();
</script>

<div class="seat" class:top={at === "top"} class:bottom={at === "bottom"}>
  <span class="dot" class:active></span>
  <span class="name">{name}</span>
  {#if kind}
    {#if onkind}<button class="chip" title={kindHint} onclick={onkind}>{kind}</button>{:else}<span class="chip">{kind}</span>{/if}
  {/if}
  {#if option}
    {#if onoption}<button class="chip" title={optionHint} onclick={onoption}>{option}</button>{:else}<span class="chip">{option}</span>{/if}
  {/if}
  {#if lost.length || edge > 0}
    <span class="taken" title="what {name} has lost{edge > 0 ? ` · ${edge} ahead` : ''}">
      <span class="pile" class:white class:black={!white}>{lost.join("")}</span>
      {#if edge > 0}<span class="edge">+{edge}</span>{/if}
    </span>
  {/if}
  {#if clock}<span class="clock" class:running>{clock}</span>{/if}
</div>

<style>
  .seat {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    flex: none;
    padding: 0 10px;
    box-sizing: border-box;
    font-family: var(--code);
    font-size: var(--font-size-sm);
  }
  .seat.top {
    border-bottom: 1px solid var(--b0);
  }
  .seat.bottom {
    border-top: 1px solid var(--b0);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: 0 0 auto;
    background: var(--b3);
    box-shadow: 0 0 5px var(--b3);
  }
  .dot.active {
    background: var(--primary);
    box-shadow: 0 0 5px var(--primary);
  }
  .name {
    min-width: 0;
    font-family: var(--sans);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--t1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* the pile is the row's give: it shrinks and clips before the name or the clock do */
  .taken {
    min-width: 0;
    flex-shrink: 4;
    display: flex;
    align-items: baseline;
    gap: 5px;
    overflow: hidden;
  }
  .pile {
    min-width: 0;
    font-variant-emoji: text;
    font-size: var(--font-size-sm);
    line-height: 1;
    letter-spacing: -0.12em;
    white-space: nowrap;
    overflow: hidden;
  }
  /* the pile sits on a square of its own, lit the way the board lights its pieces — legible on any
     row, whatever the theme puts behind it */
  .pile.white,
  .pile.black {
    padding: 2px 5px 2px 3px;
    border: 1px solid var(--b0);
    border-radius: 2px;
  }
  .pile.white {
    color: var(--pw);
    background: var(--sq-dark);
    text-shadow: 0 0 2px var(--pw-shadow), 0 1px 1px var(--pw-shadow);
  }
  .pile.black {
    color: var(--pb);
    background: var(--sq-light);
    text-shadow: 0 0 2px var(--pb-shadow), 0 1px 1px var(--pb-shadow);
  }
  .edge {
    flex: none;
    font-size: var(--font-size-xs);
    color: var(--t3);
  }
  .clock {
    margin-left: auto;
    font-size: var(--font-size-base);
    color: var(--t3);
    font-variant-numeric: tabular-nums;
  }
  .clock.running {
    color: var(--t1);
  }
</style>
