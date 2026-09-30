import { createEffect, createMemo, createSignal, For, from, onCleanup, onMount, Show } from "solid-js";
import { _render, createComponent, extend, RendererContext } from "@opentui/solid";
import * as board from "./board.js";
import * as render from "./render.js";
import * as tones from "./tones.js";
import { COMMANDS, session } from "./session.js";
import { sprite, stamp } from "./raster.js";
import { canvas, gallery, painted } from "./picture.js";
import { ScaledImage } from "./scaled.js";

extend({ scaled_image: ScaledImage });

const GAP = 2;
const CORNERS = [
  ["┏", () => ({ x: 0, y: 0 })],
  ["┓", (cell) => ({ x: cell.columns - 1, y: 0 })],
  ["┗", (cell) => ({ x: 0, y: cell.rows - 1 })],
  ["┛", (cell) => ({ x: cell.columns - 1, y: cell.rows - 1 })],
];

const OFFERED = [
  [(uci) => uci[3] === "8", (uci) => [8, 7, 6, 5].map((rank) => `${uci[2]}${rank}`)],
  [() => true, (uci) => [1, 2, 3, 4].map((rank) => `${uci[2]}${rank}`)],
];

const offers = (uci) => OFFERED.find(([test]) => test(uci))[1](uci);

const DIRECTIONS = { beside: "row", below: "column", alone: "column" };

export function Play(props) {
  const { palette, buffer, element, renderer, display } = props;
  const data = from(buffer.$data);
  const held = session(buffer);
  const busy = from(held.$busy);
  const fault = from(held.$fault);
  const [size, setSize] = createSignal({ width: element.width, height: element.height });
  const [sensed, setSensed] = createSignal(render.sense(renderer, display));
  const [picked, setPicked] = createSignal(null);
  const [grip, setGrip] = createSignal(null);
  const [promoting, setPromoting] = createSignal(null);
  const [now, setNow] = createSignal(Date.now());
  const ink = tones.inks(palette);
  const TONES = tones.toned(palette);
  const RGB = tones.colours(palette);
  const pictures = gallery();
  let grid;

  const ready = () => data().fen !== undefined;
  const ratio = () => render.aspect(sensed());
  const shape = createMemo(() => render.fit(size(), ratio()), undefined, { equals: (one, other) => one.rows === other.rows && one.columns === other.columns && one.panel === other.panel });
  const mode = () => render.rendered(data(), sensed());
  const orientation = () => board.oriented(data());
  const position = createMemo(() => (ready() ? board.pieces(board.shown(data()).fen) : {}));
  const movable = () => board.mover(data()) && !busy() && promoting() === null;
  const offering = () => (promoting() === null ? [] : offers(promoting()));

  const occupant = (at) => {
    const index = offering().indexOf(at);
    if (index >= 0) return board.shown(data()).turn === "white" ? board.PROMOTIONS[index].toUpperCase() : board.PROMOTIONS[index];
    const lifted = grip() !== null && grip().dragging && grip().from === at;
    return lifted ? undefined : position()[at];
  };

  const state = (square) => {
    const hold = grip();
    const dragging = hold !== null && hold.dragging;
    const target = movable() && board.targets(data(), picked()).includes(square.at);
    const last = board.shown(data()).lastMove;
    return {
      ...square,
      checked: data().check === true && board.king(data()) === square.at,
      hovered: dragging && hold.over === square.at && hold.over !== hold.from,
      source: picked() === square.at,
      marked: last !== null && (last.slice(0, 2) === square.at || last.slice(2, 4) === square.at),
      target,
      capture: target && position()[square.at] !== undefined,
      piece: occupant(square.at),
    };
  };

  const scene = createMemo(() => (ready() ? board.squares(orientation()) : []).map((square) => {
    const seen = state(square);
    return { ...seen, tone: tones.tone(TONES, seen), mark: tones.mark(seen) };
  }));

  const lifted = () => {
    const hold = grip();
    if (hold === null || !hold.dragging || hold.over === null) return null;
    const square = board.squares(orientation()).find((each) => each.at === hold.over);
    return { ...square, piece: position()[hold.from] };
  };

  const label = (square) => {
    const { columns, rows } = shape();
    const ticks = [];
    if (square.column === 0) ticks.push({ char: String(square.at[1]), x: -render.GUTTER.left, y: Math.floor(rows / 2) });
    if (square.row === 7) ticks.push({ char: square.at[0], x: Math.floor(columns / 2), y: rows });
    return ticks;
  };

  const paint = (target) => {
    const { columns, rows } = shape();
    const glyphs = mode() === "glyph";
    for (const square of scene()) {
      const x = grid.x + square.column * columns;
      const y = grid.y + square.row * rows;
      const under = RGB[square.tone];
      target.fillRect(x, y, columns, rows, under);
      if (glyphs && square.piece !== undefined) stamp(target, x, y, sprite(square.piece.toLowerCase(), columns, rows), RGB[ink[board.sideOf(square.piece)]], under);
      for (const tick of label(square)) target.setCell(x + tick.x, y + tick.y, tick.char, RGB.textMuted, RGB.surface);
      if (glyphs && square.mark === "dot" && square.piece === undefined) target.setCell(x + Math.floor(columns / 2), y + Math.floor(rows / 2), "●", RGB.signalPrimary, under);
      if (square.mark === "corners" && glyphs && columns >= 3 && rows >= 2)
        for (const [char, corner] of CORNERS) target.setCell(x + corner({ columns, rows }).x, y + corner({ columns, rows }).y, char, RGB.signalPrimary, under);
    }
    target.fillRect(grid.x + 8 * columns, grid.y, render.GUTTER.right, 8 * rows, RGB.surface);
    const floating = lifted();
    if (glyphs && floating !== null && floating.piece !== undefined)
      stamp(target, grid.x + floating.column * columns, grid.y + floating.row * rows, sprite(floating.piece.toLowerCase(), columns, rows), RGB[ink[board.sideOf(floating.piece)]], RGB.signalPrimary);
  };

  const INKED = [
    [(square) => square.piece === undefined, () => ({ role: null })],
    [() => true, (square) => ({ role: square.piece.toLowerCase(), body: palette[ink[board.sideOf(square.piece)]], rim: palette[ink[board.opponent(board.sideOf(square.piece))]] })],
  ];

  const tile = (square) => {
    const { columns, rows } = shape();
    const size = canvas(columns, rows, render.pixels(sensed()));
    const key = `${square.piece}:${square.tone}:${square.mark}:${size.width}x${size.height}`;
    const occupant = INKED.find(([test]) => test(square))[1](square);
    return pictures.get(key, () => painted({ ...occupant, ground: palette[square.tone], accent: palette.signalPrimary, mark: square.mark, size }));
  };

  const squareAt = (event) => {
    const column = Math.floor((event.x - grid.x) / shape().columns);
    const row = Math.floor((event.y - grid.y) / shape().rows);
    if (column < 0 || column > 7 || row < 0 || row > 7) return null;
    return `${board.files(orientation())[column]}${board.ranks(orientation())[row]}`;
  };

  const play = (uci) => {
    setPicked(null);
    if (board.promotes(data(), uci)) return setPromoting(uci);
    held.move(uci);
  };
  const promote = (role) => {
    const uci = promoting() + role;
    setPromoting(null);
    held.move(uci);
  };

  const press = (event) => {
    const at = squareAt(event);
    if (promoting() !== null) {
      const index = offering().indexOf(at);
      return index >= 0 ? promote(board.PROMOTIONS[index]) : setPromoting(null);
    }
    if (!movable() || at === null) return;
    if (picked() !== null && board.targets(data(), picked()).includes(at)) return play(picked() + at);
    if (!board.owns(data(), at)) return setPicked(null);
    setPicked(at);
    setGrip({ from: at, over: at, dragging: false });
  };
  const drag = (event) => {
    if (grip() === null) return;
    setGrip({ ...grip(), dragging: true, over: squareAt(event) });
  };
  const release = (event) => {
    const hold = grip();
    setGrip(null);
    if (hold === null || !hold.dragging) return;
    const at = squareAt(event);
    if (at === hold.from) return;
    if (at !== null && board.targets(data(), hold.from).includes(at)) return play(hold.from + at);
    setPicked(null);
  };

  const sensing = async () => {
    const next = render.sense(renderer, display);
    if (!render.same(next, sensed())) setSensed(next);
  };
  const resized = () => setSize({ width: element.width, height: element.height });

  createEffect(() => {
    if (!ready()) return;
    scene();
    lifted();
    mode();
    shape();
    renderer.requestRender();
  });

  let ticker = null;
  onMount(() => {
    element.on("resize", resized);
    renderer.setFrameCallback(sensing);
    resized();
    ticker = setInterval(() => setNow(Date.now()), 500);
    if (!ready()) held.open();
    else if (data().status === "playing" && data().seats[data().turn].kind !== "user") held.resume();
  });
  onCleanup(() => {
    held.close();
    clearInterval(ticker);
    element.off("resize", resized);
    renderer.removeFrameCallback(sensing);
    pictures.dispose();
  });

  const Seat = (seatProps) => {
    const side = () => seatProps.side;
    const seat = () => data().seats[side()];
    const active = () => !board.ended(data()) && board.shown(data()).turn === side();
    const taken = () => board.material(data()).lost[board.opponent(side())];
    const edge = () => board.material(data()).edge[side()];
    const optioned = () => (board.option(seat()) === "" ? "" : ` · ${board.option(seat())}`);
    return (
      <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
        <text wrapMode="none" truncate selectable={false} style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          <span style={{ fg: active() ? palette.signalPrimary : palette.textMuted }}>{active() ? "● " : "○ "}</span>
          <span style={{ fg: active() ? palette.textStrong : palette.textInk }}>{`${board.named(seat())}${optioned()}`}</span>
          <span style={{ fg: palette.textLight }}>{taken().length > 0 ? `  ${taken().map((role) => board.GLYPH[role]).join("")}` : ""}</span>
          <span style={{ fg: palette.textMuted }}>{edge() > 0 ? ` +${edge()}` : ""}</span>
        </text>
        <Show when={data().clock !== undefined}>
          <text wrapMode="none" selectable={false} fg={active() ? palette.inverseOn : palette.textInk} bg={active() ? palette.signalPrimary : palette.surfaceLift} style={{ flexShrink: 0 }}>
            {` ${board.clockText(data().clock, side(), now())} `}
          </text>
        </Show>
      </box>
    );
  };

  const NOTES = [
    [() => fault() !== null, () => ({ text: `✕ ${fault()}`, fg: palette.signalNegative })],
    [() => promoting() !== null, () => ({ text: "promote — click a piece on the board or below", fg: palette.signalCaution })],
    [() => board.rewound(data()), () => ({ text: `showing ply ${board.at(data())} of ${board.plies(data())} · a move here forks the game`, fg: palette.signalCaution })],
    [() => board.ended(data()), () => ({ text: `${data().result} · ${data().reason}${data().opening === undefined ? "" : ` · ${data().opening.eco} ${data().opening.name}`}`, fg: palette.signalPrimary })],
    [() => data().offers.draw !== undefined, () => ({ text: `${data().offers.draw} offers a draw${data().offers.draw === board.seated(data()) ? " — waiting" : " — draw accepts"}`, fg: palette.signalCaution })],
    [() => data().thinking !== undefined && !board.mover(data()), () => ({ text: `${board.named(data().seats[board.opponent(data().turn)])}: ${data().thinking}`, fg: palette.textInk })],
    [() => board.waiting(data()), () => ({ text: `${board.named(data().seats[data().turn])} has ${data().turn} — press ▶ start`, fg: palette.signalPrimary })],
    [() => board.mover(data()), () => ({ text: `your move${data().check === true ? " · check" : ""} · click or drag`, fg: palette.textInk })],
    [() => true, () => ({ text: busy() ? "thinking…" : `${board.named(data().seats[data().turn])} to move`, fg: palette.textMuted })],
  ];
  const note = () => NOTES.find(([test]) => test())[1]();

  const Note = () => (
    <text id="note" wrapMode="none" truncate selectable={false} fg={note().fg} style={{ height: 1, flexShrink: 0 }}>
      {note().text}
    </text>
  );

  const Button = (buttonProps) => (
    <text
      id={`button-${buttonProps.name}`}
      wrapMode="none"
      selectable={false}
      fg={buttonProps.enabled ? palette.textStrong : palette.textLight}
      bg={buttonProps.enabled ? palette.surfaceLift : palette.surfaceSunk}
      style={{ flexShrink: 0, height: 1, marginRight: 1 }}
      onMouseUp={() => (buttonProps.enabled ? buttonProps.run() : undefined)}
    >
      {` ${buttonProps.label} `}
    </text>
  );

  const Buttons = () => (
    <box id="buttons" style={{ flexDirection: "row", flexWrap: "wrap", flexShrink: 0 }}>
      <Show
        when={promoting() === null}
        fallback={<For each={board.PROMOTIONS}>{(role) => <Button name={`promote-${role}`} label={`${board.GLYPH[role]} ${role}`} enabled run={() => promote(role)} />}</For>}
      >
        <For each={COMMANDS.filter((command) => command.ready(data()))}>
          {(command) => <Button name={command.name} label={command.label(data())} enabled={!busy()} run={() => command.run(held, data())} />}
        </For>
      </Show>
    </box>
  );

  const listed = () => Math.max(0, 8 * shape().rows - 9);

  const Moves = () => (
    <box id="moves" style={{ flexDirection: "column", flexGrow: 1, flexShrink: 1, minHeight: 0, overflow: "hidden" }}>
      <text wrapMode="none" truncate selectable={false} fg={palette.textMuted}>{`moves ${board.plies(data())}${board.rewound(data()) ? ` · at ${board.at(data())}` : ""}`}</text>
      <For each={board.pairs(data().sans).slice(-Math.max(1, listed()))}>
        {(pair) => (
          <box style={{ flexDirection: "row", height: 1, flexShrink: 0 }}>
            <text wrapMode="none" selectable={false} fg={palette.textMuted}>{`${String(pair.number).padStart(3)}. `}</text>
            <text wrapMode="none" selectable={false} fg={board.at(data()) === pair.plies[0] ? palette.signalPrimary : palette.textInk} onMouseUp={() => (data().rewindable ? held.seek(pair.plies[0]) : undefined)}>
              {pair.white.padEnd(8)}
            </text>
            <text wrapMode="none" selectable={false} fg={board.at(data()) === pair.plies[1] ? palette.signalPrimary : palette.textInk} onMouseUp={() => (data().rewindable ? held.seek(pair.plies[1]) : undefined)}>
              {pair.black}
            </text>
          </box>
        )}
      </For>
    </box>
  );

  const tail = () => board.pairs(data().sans).slice(-6).map((pair) => `${pair.number}. ${pair.white} ${pair.black}`).join("  ");

  const PANELS = {
    beside: () => (
      <box id="panel" style={{ flexDirection: "column", flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <Seat side={board.opponent(orientation())} />
        <text>{" "}</text>
        <Moves />
        <Seat side={orientation()} />
        <Note />
        <Buttons />
      </box>
    ),
    below: () => (
      <box id="panel" style={{ flexDirection: "column", flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 0, overflow: "hidden", width: 8 * shape().columns }}>
        <Seat side={board.opponent(orientation())} />
        <Seat side={orientation()} />
        <text wrapMode="none" truncate selectable={false} fg={palette.textInk} style={{ height: 1, flexShrink: 0 }}>{`moves ${board.plies(data())}  ${tail()}`}</text>
        <Note />
        <Buttons />
      </box>
    ),
    alone: () => (
      <box id="panel" style={{ flexDirection: "column", flexShrink: 0, width: 8 * shape().columns }}>
        <Note />
        <Buttons />
      </box>
    ),
  };

  const Picture = (pictureProps) => (
    <scaled_image
      id={pictureProps.id}
      cell={render.device(sensed())}
      source={tile(pictureProps.square)}
      fit="fill"
      protocol={render.protocol(sensed())}
      style={{
        position: "absolute",
        left: pictureProps.square.column * shape().columns,
        top: pictureProps.square.row * shape().rows,
        width: shape().columns,
        height: shape().rows,
      }}
    />
  );

  const Pictures = () => (
    <Show when={mode() === "image"}>
      <For each={board.squares(orientation()).map((square) => square.at)}>
        {(at) => <Picture id={`square-${at}`} square={scene().find((each) => each.at === at)} />}
      </For>
      <Show when={lifted() !== null && lifted().piece !== undefined}>
        <Picture id="square-lifted" square={{ ...lifted(), tone: "signalPrimary", mark: "none" }} />
      </Show>
    </Show>
  );

  const Board = () => (
    <box
      id="board"
      ref={grid}
      style={{ flexShrink: 0, width: 8 * shape().columns + render.GUTTER.right, height: 8 * shape().rows, marginLeft: render.GUTTER.left, marginBottom: render.GUTTER.below }}
      renderAfter={paint}
      onMouseDown={press}
      onMouseDrag={drag}
      onMouseUp={release}
    >
      <Pictures />
    </box>
  );

  return (
    <box style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      <Show
        when={ready()}
        fallback={<text fg={fault() === null ? palette.textMuted : palette.signalNegative}>{fault() === null ? "◇ opening a match…" : `✕ ${fault()}`}</text>}
      >
        <box style={{ flexDirection: DIRECTIONS[shape().panel], flexGrow: 1, gap: shape().panel === "beside" ? GAP : 0, alignItems: shape().panel === "beside" ? "flex-start" : "center" }}>
          <Board />
          {PANELS[shape().panel]()}
        </box>
      </Show>
    </box>
  );
}

export default (element, { terminal, buffer, renderer, palette, focused, display }) => {
  const dispose = _render(
    () =>
      createComponent(RendererContext.Provider, {
        value: renderer,
        get children() {
          return createComponent(Play, { terminal, buffer, renderer, palette, focused, display, element });
        },
      }),
    element,
  );
  return {
    destroy: () => {
      dispose();
      for (const child of element.getChildren()) child.destroyRecursively();
    },
  };
};
