<script>
  import { PIECESETS } from "../kit/pieces.js";

  const { pieceset = "chessnut", theme = "inherit", busy = false, onpieceset, ontheme } = $props();

  const GLYPH = { k: "♚︎", q: "♛︎", r: "♜︎", b: "♝︎", n: "♞︎", p: "♟︎" };
  const SHOWN = ["k", "q", "r", "b", "n", "p"];
  const THEMES = [
    { name: "inherit", hint: "the box's theme" },
    { name: "brown", hint: "lichess brown" },
    { name: "blue", hint: "lichess blue" },
    { name: "green", hint: "chess.com green" },
  ];
  const SETS = [
    { name: "glyph", hint: "the font's chess characters" },
    ...Object.entries(PIECESETS).map(([name, set]) => ({ name, hint: `${set.author} · ${set.licence}` })),
  ];
  const drawn = $derived(pieceset in PIECESETS ? pieceset : "chessnut");
</script>

{#snippet piece(name, side, role)}
  {#if name === "glyph"}
    <span class="glyph" class:white={side === "white"} class:black={side === "black"}>{GLYPH[role]}</span>
  {:else}
    <svg class="drawn" class:white={side === "white"} class:black={side === "black"} viewBox={PIECESETS[name].frame}>
      {@html PIECESETS[name][side][role]}
    </svg>
  {/if}
{/snippet}

<div class="stack">
  <span class="label">theme · this game</span>
  {#each THEMES as board (board.name)}
    <button
      class="set"
      class:on={theme === board.name}
      disabled={busy || theme === board.name}
      title={board.hint}
      onclick={() => ontheme(board.name)}>
      <span class="name">{board.name}</span>
      <span class="strip" data-board={board.name}>
        {#each SHOWN as role, index (role)}
          <span class="cell" class:dark={index % 2 === 1}>
            {@render piece(drawn, index < 3 ? "white" : "black", role)}
          </span>
        {/each}
      </span>
    </button>
  {/each}
</div>

<div class="stack">
  <span class="label">pieces · this game</span>
  {#each SETS as set (set.name)}
    <button
      class="set"
      class:on={pieceset === set.name}
      disabled={busy || pieceset === set.name}
      title={set.hint}
      onclick={() => onpieceset(set.name)}>
      <span class="name">{set.name}</span>
      <span class="strip" data-board={theme}>
        {#each SHOWN as role, index (role)}
          <span class="cell" class:dark={index % 2 === 1}>
            {@render piece(set.name, index < 3 ? "white" : "black", role)}
          </span>
        {/each}
      </span>
    </button>
  {/each}
</div>

<style>
  .stack + .stack {
    margin-top: 14px;
  }
  .set {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid var(--b0);
    border-radius: 4px;
    background: var(--s2);
    color: var(--t3);
    font-family: var(--code);
    font-size: var(--font-size-xs);
    text-align: left;
    cursor: pointer;
  }
  .set:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--t1);
  }
  .set.on {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    cursor: default;
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    max-width: 240px;
    border-radius: 3px;
    overflow: hidden;
  }
  .cell {
    position: relative;
    aspect-ratio: 1;
    container-type: inline-size;
    background: var(--sq-light);
  }
  .cell.dark {
    background: var(--sq-dark);
  }
  .white {
    --piece-fill: var(--pw);
    --piece-ink: var(--pb);
    --piece-shade: color-mix(in srgb, var(--pw) 78%, var(--pb));
    --piece-edge: var(--pb);
  }
  .black {
    --piece-fill: var(--pb);
    --piece-ink: var(--pw);
    --piece-shade: color-mix(in srgb, var(--pb) 50%, var(--pw));
    --piece-edge: var(--pb);
  }
  .drawn {
    position: absolute;
    inset: 6%;
    width: 88%;
    height: 88%;
    fill: var(--piece-ink);
  }
  .glyph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--piece-fill);
    font-family: Menlo, "DejaVu Sans Mono", monospace;
    font-variant-emoji: text;
    font-size: 80cqw;
    line-height: 1;
    filter: drop-shadow(0 0 0.6px var(--piece-ink)) drop-shadow(0 0 0.6px var(--piece-ink));
  }
</style>
