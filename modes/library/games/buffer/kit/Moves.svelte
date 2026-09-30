<script>
  // the move list, as the dock's moves panel: pairs of SAN, an active ply, a mark per ply
  // (?! ? ?? ★) in a tone. seekable when the caller hands `onseek`.
  const { sans = [], cursor = null, marks = {}, onseek = null, label = "moves", meta = "", empty = "— drag a piece to begin" } = $props();

  const rows = $derived.by(() => {
    const out = [];
    for (let index = 0; index < sans.length; index += 2) {
      out.push({
        number: index / 2 + 1,
        cells: [
          { ply: index + 1, san: sans[index], mark: marks[index + 1] ?? null },
          sans[index + 1] ? { ply: index + 2, san: sans[index + 1], mark: marks[index + 2] ?? null } : null,
        ],
      });
    }
    return out;
  });
</script>

<div class="moves">
  <div class="head"><span class="label">{label}</span>{#if meta}<span class="count">{meta}</span>{/if}</div>
  <div class="grid">
    {#each rows as row (row.number)}
      <span class="number">{row.number}.</span>
      {#each row.cells as cell, side (side)}
        {#if cell}
          {#if onseek}
            <button class="san" class:active={cell.ply === cursor} class:secondary={cell.mark?.tone === "secondary"} class:warning={cell.mark?.tone === "warning"} class:danger={cell.mark?.tone === "danger"} class:success={cell.mark?.tone === "success"} onclick={() => onseek(cell.ply)}>
              <span>{cell.san}</span>{#if cell.mark}<span class="mark">{cell.mark.text}</span>{/if}
            </button>
          {:else}
            <span class="san" class:active={cell.ply === cursor} class:secondary={cell.mark?.tone === "secondary"} class:warning={cell.mark?.tone === "warning"} class:danger={cell.mark?.tone === "danger"} class:success={cell.mark?.tone === "success"}>
              <span>{cell.san}</span>{#if cell.mark}<span class="mark">{cell.mark.text}</span>{/if}
            </span>
          {/if}
        {:else}
          <span></span>
        {/if}
      {/each}
    {/each}
    {#if !sans.length && empty}<span class="empty">{empty}</span>{/if}
  </div>
</div>

<style>
  .moves {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-family: var(--code);
  }
  .count {
    font-size: var(--font-size-xs);
    color: var(--t3);
  }
  .grid {
    display: grid;
    grid-template-columns: 30px 1fr 1fr;
    row-gap: 1px;
    font-size: var(--font-size-sm);
  }
  .number {
    color: var(--t3);
    padding: 3px 0;
  }
  .san {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding: 3px 6px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--t1);
    font: inherit;
    text-align: left;
  }
  button.san {
    cursor: pointer;
  }
  button.san:hover {
    background: var(--s3);
  }
  .san.active {
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--primary);
  }
  .mark {
    font-weight: 600;
  }
  .san.secondary .mark { color: var(--secondary); }
  .san.warning .mark { color: var(--warning); }
  .san.danger .mark { color: var(--danger); }
  .san.success .mark { color: var(--success); }
  .empty {
    grid-column: 1 / -1;
    padding-top: 4px;
    color: var(--t3);
  }
</style>
