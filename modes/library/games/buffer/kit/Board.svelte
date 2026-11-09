<script>
  // the board: 64 squares, pieces drawn in the game's `pieceset` (a drawn set or glyph), drag or click to move. it knows no rules — the caller
  // hands it the legal destinations per square (the domain's `dests`) and hears `onmove(uci)`.
  // `tints` marks squares by name, "good" or "bad" — a riddle's wanted move and the move played.
  import { play as sound } from "./sound.js";
  import { PIECESETS } from "./pieces.js";

  const { fen, orientation = "white", lastMove = null, dests = {}, movable = false, check = false, pieceset = "chessnut", theme = "inherit", hint = null, tints = {}, onmove = null } = $props();

  // a move that lands sounds — the user's or the other seat's, or a step through a game. the
  // first render is silent (a loaded game arrives with its last move), and so is a reset
  let heard;
  $effect(() => {
    const now = lastMove ? `${lastMove}@${fen}` : null;
    if (heard !== undefined && now && now !== heard) sound();
    heard = now;
  });

  const FILES = "abcdefgh";
  const GLYPH = { k: "♚︎", q: "♛︎", r: "♜︎", b: "♝︎", n: "♞︎", p: "♟︎" };
  const GLYPH_SIZE = { k: 136, q: 117, r: 117, b: 117, n: 112, p: 117 };
  const PROMOTIONS = ["q", "r", "b", "n"];
  const SLOP = 4;

  let selected = $state(null);
  let drag = $state(null);
  let promoting = $state(null);
  let grid = $state(null);
  let pressed = null;
  let moved = false;

  const name = (square) => FILES[square % 8] + (1 + (square >> 3));
  const at = (text) => FILES.indexOf(text[0]) + (Number(text[1]) - 1) * 8;
  const isWhite = (piece) => piece === piece.toUpperCase();

  const pieces = $derived.by(() => {
    const board = new Array(64).fill(null);
    const [placement = ""] = String(fen ?? "").split(" ");
    placement.split("/").forEach((row, rank) => {
      let file = 0;
      for (const char of row) {
        if (/\d/.test(char)) file += Number(char);
        else board[(7 - rank) * 8 + file++] = char;
      }
    });
    return board;
  });
  const turn = $derived(String(fen ?? "").split(" ")[1] === "b" ? "black" : "white");
  const flipped = $derived(orientation === "black");
  const legal = (square) => (dests?.[name(square)] ?? []).map(at);
  const targets = $derived(selected == null ? [] : legal(selected));
  const king = $derived(check ? pieces.indexOf(turn === "white" ? "K" : "k") : -1);
  const last = $derived(lastMove ? [at(lastMove.slice(0, 2)), at(lastMove.slice(2, 4))] : []);
  const hinted = $derived(hint ? at(hint) : -1);
  const canMove = (square) => movable && legal(square).length > 0;

  const squares = $derived.by(() => {
    const out = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const rank = flipped ? row : 7 - row;
        const file = flipped ? 7 - col : col;
        const square = rank * 8 + file;
        const piece = pieces[square];
        out.push({
          square,
          light: (rank + file) % 2 === 1,
          role: piece ? piece.toLowerCase() : "",
          white: piece ? isWhite(piece) : true,
          selected: square === selected,
          last: last.includes(square),
          dot: targets.includes(square) && !piece,
          ring: targets.includes(square) && Boolean(piece),
          check: square === king,
          hint: square === hinted,
          tint: tints?.[name(square)] ?? null,
          grab: canMove(square) || targets.includes(square),
          lifted: drag?.from === square,
          rank: col === 0 ? String(rank + 1) : "",
          file: row === 7 ? FILES[file] : "",
        });
      }
    }
    return out;
  });

  const promotes = (from, to) => pieces[from]?.toLowerCase() === "p" && (to >> 3 === 7 || to >> 3 === 0);

  const play = (from, to) => {
    if (!legal(from).includes(to)) return false;
    selected = null;
    if (promotes(from, to)) promoting = { from, to };
    else onmove?.(name(from) + name(to));
    return true;
  };

  const promote = (piece) => {
    const { from, to } = promoting;
    promoting = null;
    onmove?.(name(from) + name(to) + piece);
  };

  const cancel = () => {
    promoting = null;
    selected = null;
  };

  const hit = (event) => {
    const rect = grid.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    const col = Math.floor(x * 8);
    const row = Math.floor(y * 8);
    const file = flipped ? 7 - col : col;
    const rank = flipped ? row : 7 - row;
    return { square: rank * 8 + file, x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const down = (event) => {
    if (!movable || promoting) return;
    const found = hit(event);
    if (!found) return;
    if (selected != null && selected !== found.square && play(selected, found.square)) return;
    if (!canMove(found.square)) return void (selected = null);
    pressed = found;
    moved = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selected = found.square;
  };

  // a press is a drag only once it travels a few pixels — a wobbly tap still selects and clicks
  const move = (event) => {
    if (!pressed) return;
    const rect = grid.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!moved && Math.hypot(x - pressed.x, y - pressed.y) < SLOP) return;
    moved = true;
    drag = { from: pressed.square, x: Math.max(0, Math.min(rect.width, x)), y: Math.max(0, Math.min(rect.height, y)) };
  };

  const up = (event) => {
    if (!pressed) return;
    const from = pressed.square;
    pressed = null;
    const found = hit(event);
    drag = null;
    if (!found || found.square === from) {
      if (moved) selected = null;
      return;
    }
    if (!play(from, found.square) && moved) selected = null;
  };

  const dragged = $derived(drag ? pieces[drag.from] : null);
</script>

{#snippet glyph(role)}
  <text x="50" y="91" text-anchor="middle" font-size={GLYPH_SIZE[role]}>{GLYPH[role]}</text>
{/snippet}

<div class="board" class:movable data-board={theme}>
  <div class="grid" bind:this={grid} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
    {#each squares as s (s.square)}
      <div class="sq" class:light={s.light} class:dark={!s.light} class:selected={s.selected} class:last={s.last} class:check={s.check} class:hint={s.hint} class:good={s.tint === "good"} class:bad={s.tint === "bad"} class:grab={s.grab}>
        {#if s.role && pieceset === "glyph"}<svg class="piece glyph" class:white={s.white} class:black={!s.white} class:lifted={s.lifted} data-role={s.role} viewBox="0 0 100 100">{@render glyph(s.role)}</svg>
        {:else if s.role}<svg class="piece" class:white={s.white} class:black={!s.white} class:lifted={s.lifted} data-role={s.role} viewBox={PIECESETS[pieceset].frame} preserveAspectRatio="xMidYMax meet">{@html PIECESETS[pieceset][s.white ? "white" : "black"][s.role]}</svg>{/if}
        {#if s.dot}<span class="dot"></span>{/if}
        {#if s.ring}<span class="ring"></span>{/if}
        {#if s.rank}<span class="coord rank">{s.rank}</span>{/if}
        {#if s.file}<span class="coord file">{s.file}</span>{/if}
      </div>
    {/each}
  </div>
  {#if drag && dragged && pieceset === "glyph"}
    <svg class="ghost glyph" class:white={isWhite(dragged)} class:black={!isWhite(dragged)} style:left="{drag.x}px" style:top="{drag.y}px" viewBox="0 0 100 100">{@render glyph(dragged.toLowerCase())}</svg>
  {:else if drag && dragged}
    <svg class="ghost" class:white={isWhite(dragged)} class:black={!isWhite(dragged)} style:left="{drag.x}px" style:top="{drag.y}px" viewBox={PIECESETS[pieceset].frame}>{@html PIECESETS[pieceset][isWhite(dragged) ? "white" : "black"][dragged.toLowerCase()]}</svg>
  {/if}
  {#if promoting}
    <div class="promotion">
      {#each PROMOTIONS as piece}
        <button class:white={turn === "white"} class:black={turn === "black"} class:glyph={pieceset === "glyph"} onclick={() => promote(piece)}>{#if pieceset === "glyph"}<svg viewBox="0 0 100 100">{@render glyph(piece)}</svg>{:else}<svg viewBox={PIECESETS[pieceset].frame}>{@html PIECESETS[pieceset][turn][piece]}</svg>{/if}</button>
      {/each}
      <button class="cancel" onclick={cancel} title="keep the pawn where it is">✕</button>
    </div>
  {/if}
</div>

<style>
  .board {
    position: relative;
    container-type: inline-size;
    width: 100%;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    aspect-ratio: 1;
    width: 100%;
    overflow: hidden;
    user-select: none;
    touch-action: none;
  }
  .sq {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1;
  }
  .sq.light {
    background-color: var(--sq-light);
  }
  .sq.dark {
    background-color: var(--sq-dark);
  }
  .sq.last {
    background-image: linear-gradient(var(--hl-last), var(--hl-last));
  }
  .sq.selected,
  .sq.hint {
    background-image: linear-gradient(var(--hl-sel), var(--hl-sel));
  }
  .sq.good {
    background-image: linear-gradient(color-mix(in srgb, var(--success) 45%, transparent), color-mix(in srgb, var(--success) 45%, transparent));
  }
  .sq.bad {
    background-image: linear-gradient(color-mix(in srgb, var(--danger) 45%, transparent), color-mix(in srgb, var(--danger) 45%, transparent));
  }
  .sq.check {
    background-image: radial-gradient(color-mix(in srgb, var(--danger) 75%, transparent) 25%, transparent 72%);
  }
  .movable .sq.grab {
    cursor: grab;
  }
  .piece {
    position: absolute;
    inset: 6%;
    width: 88%;
    height: 88%;
    fill: var(--piece-ink);
    pointer-events: none;
  }
  .piece.white,
  .ghost.white,
  .promotion button.white {
    --piece-fill: var(--pw);
    --piece-ink: var(--pb);
    --piece-shade: color-mix(in srgb, var(--pw) 78%, var(--pb));
    --piece-edge: var(--pb);
    filter: drop-shadow(0 0.15cqw 0.2cqw var(--pw-shadow));
  }
  .piece.black,
  .ghost.black,
  .promotion button.black {
    --piece-fill: var(--pb);
    --piece-ink: var(--pw);
    --piece-shade: color-mix(in srgb, var(--pb) 50%, var(--pw));
    --piece-edge: var(--pb);
    filter: drop-shadow(0 0.15cqw 0.2cqw var(--pb-shadow));
  }
  .glyph text {
    font-family: Menlo, "DejaVu Sans Mono", monospace;
    fill: var(--piece-fill);
    font-variant-emoji: text;
  }
  .piece.glyph,
  .ghost.glyph,
  .promotion button.glyph svg {
    overflow: visible;
    filter: drop-shadow(0 0 0.6px var(--piece-ink)) drop-shadow(0 0 0.6px var(--piece-ink));
  }
  .piece.lifted {
    opacity: 0.25;
  }
  .dot {
    position: absolute;
    width: 32%;
    height: 32%;
    border-radius: 50%;
    background: var(--hl-dot);
    pointer-events: none;
  }
  .ring {
    position: absolute;
    inset: 0;
    background: radial-gradient(transparent 0 78%, var(--hl-dot) 79%);
    pointer-events: none;
  }
  .coord {
    position: absolute;
    font-family: var(--head);
    font-size: 2.6cqw;
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
  }
  .coord.rank {
    top: 0.6cqw;
    left: 0.7cqw;
  }
  .coord.file {
    bottom: 0.6cqw;
    right: 0.7cqw;
  }
  .light .coord {
    color: var(--sq-dark);
  }
  .dark .coord {
    color: var(--sq-light);
  }
  .ghost {
    position: absolute;
    width: 11cqw;
    height: 11cqw;
    fill: var(--piece-ink);
    transform: translate(-50%, -50%) scale(1.15);
    pointer-events: none;
    z-index: 5;
  }
  .promotion {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: color-mix(in srgb, var(--s0) 72%, transparent);
    z-index: 6;
  }
  .promotion button {
    display: grid;
    place-items: center;
    font-variant-emoji: text;
    font-size: 11cqw;
    line-height: 1;
    width: 13cqw;
    height: 13cqw;
    fill: var(--piece-ink);
    padding: 8px 14px;
    border: 1px solid var(--b0);
    border-radius: 4px;
    background: var(--s1);
    cursor: pointer;
  }
  .promotion button:hover {
    border-color: var(--primary);
  }
  .promotion button.cancel {
    font-size: var(--font-size-md);
    font-family: var(--code);
    color: var(--t3);
    padding: 8px 10px;
  }
</style>
