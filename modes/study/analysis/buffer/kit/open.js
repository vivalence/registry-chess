// open a sibling chess mode on the same daemon, from inside a view: its newest thread and buffer,
// or fresh ones — the recipe anima's own panel uses (selectMode + spawnBuffer). the nav's tabs
// and the library's "open →" both go through here.
export const TABS = [
  { type: "board", slug: "play", label: "play" },
  { type: "study", slug: "analysis", label: "study" },
  { type: "riddle", slug: "puzzles", label: "riddles" },
  { type: "coach", slug: "practice", label: "practice" },
  { type: "library", slug: "games", label: "library" },
];

export const modes = (daemon) => daemon?.entities?.mode?.$entities?.get?.() ?? [];

export const sibling = (daemon, tab) => modes(daemon).find((row) => row.type === tab.type && row.slug === tab.slug) ?? null;

const newest = (rows) => [...rows].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0] ?? null;

// the terminal moves to a thread and its buffer — the last step of open, or a caller's own once
// the buffer is filled
export const show = (terminal, { thread, buffer }) => {
  terminal.thread = thread;
  terminal.buffer = buffer;
};

// `fresh` forces a new buffer on the mode's thread (the library opens each game in its own);
// `show: false` leaves the terminal where it is, for a caller that fills the buffer first
export async function open(terminal, daemon, tab, { fresh = false, data = {}, show: reveal = true } = {}) {
  const mode = sibling(daemon, tab);
  if (!mode) throw new Error(`${tab.label} is not kernelled on this daemon`);
  const threads = daemon.entities.thread.$entities.get().filter((row) => (row.mode?.id ?? row.mode) === mode.id);
  let thread = newest(threads);
  if (!thread) {
    thread = await daemon.entities.thread.create({ mode: mode.id });
    daemon.entities.thread.resolve?.(thread);
  }
  const buffers = fresh ? [] : (thread.$buffers?.get?.() ?? []);
  const buffer = buffers.at(-1) ?? (await daemon.entities.buffer.create({ mode: mode.id, thread: thread.id, data }));
  const held = { mode, thread, buffer };
  if (reveal) show(terminal, held);
  return held;
}
