<script>
  // the board: 64 squares, unicode glyphs, drag or click to move. it knows no rules — the caller
  // hands it the legal destinations per square (the domain's `dests`) and hears `onmove(uci)`.
  // `tints` marks squares by name, "good" or "bad" — a riddle's wanted move and the move played.
  import { play as sound } from "./sound.js";

  const { fen, orientation = "white", lastMove = null, dests = {}, movable = false, check = false, hint = null, tints = {}, onmove = null } = $props();

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
          glyph: piece ? GLYPH[piece.toLowerCase()] : "",
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
          coord: (row === 7 ? FILES[file] : "") + (col === 0 ? String(rank + 1) : ""),
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

<div class="board" class:movable>
  <div class="grid" bind:this={grid} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
    {#each squares as s (s.square)}
      <div class="sq" class:light={s.light} class:dark={!s.light} class:selected={s.selected} class:last={s.last} class:check={s.check} class:hint={s.hint} class:good={s.tint === "good"} class:bad={s.tint === "bad"} class:grab={s.grab}>
        {#if s.glyph}<span class="piece" class:white={s.white} class:black={!s.white} class:lifted={s.lifted}>{s.glyph}</span>{/if}
        {#if s.dot}<span class="dot"></span>{/if}
        {#if s.ring}<span class="ring"></span>{/if}
        {#if s.coord}<span class="coord">{s.coord}</span>{/if}
      </div>
    {/each}
  </div>
  {#if drag && dragged}
    <span class="ghost" class:white={isWhite(dragged)} class:black={!isWhite(dragged)} style:left="{drag.x}px" style:top="{drag.y}px">{GLYPH[dragged.toLowerCase()]}</span>
  {/if}
  {#if promoting}
    <div class="promotion">
      {#each PROMOTIONS as piece}
        <button class:white={turn === "white"} class:black={turn === "black"} onclick={() => promote(piece)}>{GLYPH[piece]}</button>
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
    font-variant-emoji: text;
    font-size: 9.5cqw;
    line-height: 1;
    pointer-events: none;
  }
  .piece.white,
  .ghost.white,
  .promotion button.white {
    color: var(--pw);
    text-shadow: 0 0 2px var(--pw-shadow), 0 1px 1px var(--pw-shadow);
  }
  .piece.black,
  .ghost.black,
  .promotion button.black {
    color: var(--pb);
    text-shadow: 0 0 2px var(--pb-shadow), 0 1px 1px var(--pb-shadow);
  }
  .piece.lifted {
    opacity: 0.25;
  }
  .dot {
    position: absolute;
    width: 26%;
    height: 26%;
    border-radius: 50%;
    background: var(--hl-dot);
    pointer-events: none;
  }
  .ring {
    position: absolute;
    inset: 0;
    border: 4px solid var(--hl-dot);
    border-radius: 2px;
    box-sizing: border-box;
    pointer-events: none;
  }
  .coord {
    position: absolute;
    left: 3px;
    bottom: 1px;
    font-family: var(--code);
    font-size: 2.4cqw;
    pointer-events: none;
  }
  .light .coord {
    color: var(--sq-dark);
  }
  .dark .coord {
    color: var(--sq-light);
  }
  .ghost {
    font-variant-emoji: text;
    position: absolute;
    transform: translate(-50%, -50%) scale(1.15);
    font-size: 9.5cqw;
    line-height: 1;
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
    font-size: 11cqw;
    line-height: 1;
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
