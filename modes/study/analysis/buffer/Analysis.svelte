<script>
  import Shell from "./kit/Shell.svelte";
  import Board from "./kit/Board.svelte";
  import Seat from "./kit/Seat.svelte";
  import Moves from "./kit/Moves.svelte";
  import Ladder from "./kit/Ladder.svelte";

  // the post-mortem: one game under the lens. the buffer carries the line laid out (fens · sans),
  // the cursor, the report and the ladders; the view steps, runs, asks. the run streams — its
  // progress lives here while it runs and lands on the buffer when it is over.
  const { terminal, daemon, mode, thread, buffer } = $props();
  const data = buffer.$data;

  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const MARK = { best: ["★", "success"], inaccuracy: ["?!", "secondary"], mistake: ["?", "warning"], blunder: ["??", "danger"] };

  let busy = $state(false);
  let fault = $state(null);
  let flipped = $state(false);
  let pgn = $state("");
  let running = $state(null);
  let asking = $state(false);
  let panel = $state("report");
  let open = $state(true);

  const call = (path, input) => mode.call.analysis[path](input);

  const loaded = $derived(($data.moves ?? []).length > 0);
  const cursor = $derived($data.cursor ?? 0);
  const total = $derived(($data.moves ?? []).length);
  const fen = $derived($data.fens?.[cursor] ?? $data.initial ?? START);
  const lastMove = $derived(cursor > 0 ? ($data.moves?.[cursor - 1] ?? null) : null);
  const report = $derived($data.report ?? null);
  const done = $derived($data.status === "done" && Boolean(report));
  const judgement = $derived(report?.judgements?.[cursor - 1] ?? null);
  const explanation = $derived($data.explanations?.[String(cursor)] ?? null);
  const ladder = $derived($data.ladders?.[String(cursor)] ?? null);
  const turnWhite = $derived(cursor % 2 === 0);

  // the eval bar: the engine's view of the position on the board, from white's side
  const bar = $derived.by(() => {
    const line = report?.judgements?.[cursor]?.eval ?? null;
    if (!line) return 50;
    const percent = line.mate != null ? (line.mate > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, line.cp)))) - 1);
    return turnWhite ? percent : 100 - percent;
  });

  const marks = $derived.by(() => {
    const out = {};
    for (const entry of report?.judgements ?? []) {
      const mark = MARK[entry.judgement];
      if (mark) out[entry.ply] = { text: mark[0], tone: mark[1] };
    }
    return out;
  });
  const count = (kind) => (report ? (report.counts?.white?.[kind] ?? 0) + (report.counts?.black?.[kind] ?? 0) : 0);

  const meta = $derived(
    [$data.tags?.Site, $data.tags?.Date?.slice(0, 4), $data.opening ? `${$data.opening.eco} ${$data.opening.name}` : $data.tags?.ECO, $data.tags?.Result]
      .filter((part) => part && part !== "?" && part !== "????")
      .join(" · ")
      .toLowerCase(),
  );

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

  const seek = (ply) => (loaded && !busy ? guard("seek", () => call("seek", { buffer: buffer.id, ply })) : null);
  const load = () => (pgn.trim() ? guard("load", () => call("load", { buffer: buffer.id, pgn, thread: thread?.id }).then(() => (pgn = ""))) : null);

  // the run streams: one record per position, the last one the verdict
  const run = () =>
    guard("analyse", async () => {
      panel = "report";
      open = true;
      running = { done: 0, total: ($data.fens ?? []).length, message: "" };
      try {
        for await (const record of await call("run", { buffer: buffer.id, depth: $data.depth ?? 14 })) {
          running = { done: record.done, total: record.total, message: record.message ?? "" };
          if (record.stage === "failed") throw new Error(record.message);
        }
      } finally {
        running = null;
      }
    });

  const elo = () =>
    cursor > 0
      ? guard("elo", async () => {
          panel = "elo";
          open = true;
          const found = await call("elo", { buffer: buffer.id, ply: cursor });
          if (found && !found.ladder) throw new Error(found.message ?? "no ladder came back");
          return found;
        })
      : null;
  const explain = () => {
    if (!judgement) return;
    asking = true;
    guard("explain", () => call("explain", { buffer: buffer.id, ply: cursor })).finally(() => (asking = false));
  };

  // the arrows walk the game; Shell hands them over only while this buffer holds the focus
  const keys = (event) => {
    if (event.key === "ArrowLeft") seek(cursor - 1);
    if (event.key === "ArrowRight") seek(cursor + 1);
    if (event.key === "Home") seek(0);
    if (event.key === "End") seek(total);
  };

  const white = $derived($data.tags?.White || "white");
  const black = $derived($data.tags?.Black || "black");
  const top = $derived(flipped ? "white" : "black");
  const plyLabel = (ply) => `${Math.ceil(ply / 2)}${ply % 2 ? "." : "…"} ${$data.sans?.[ply - 1] ?? ""}`;
  const score = (line) => (line == null ? "" : line.mate != null ? `#${line.mate}` : `${line.cp > 0 ? "+" : ""}${(line.cp / 100).toFixed(2)}`);

  const tone = $derived(judgement && MARK[judgement.judgement] ? MARK[judgement.judgement][1] : "");

  const note = $derived(
    fault ? { by: "fault", text: fault, tone: "danger" } : $data.status === "failed" ? { by: "daemon", text: $data.progress?.message ?? "the analysis failed", tone: "danger" } : null,
  );
  const actions = $derived([
    { key: "start", icon: "↺", label: "start", hint: "back to the start position", onclick: () => seek(0), disabled: !loaded || cursor === 0 },
    { key: "back", icon: "‹", label: "back", hint: "back · ←", onclick: () => seek(cursor - 1), disabled: !loaded || cursor === 0 },
    { key: "forward", icon: "›", label: "forward", hint: "forward · →", onclick: () => seek(cursor + 1), disabled: !loaded || cursor >= total },
    { key: "end", icon: "»", label: "end", hint: "jump to the end", onclick: () => seek(total), disabled: !loaded || cursor >= total },
    done
      ? { key: "elo", icon: "≈", label: "elo of this move", hint: "which limited-strength engine plays this move", tone: "primary", onclick: elo, disabled: busy || cursor === 0 }
      : { key: "analyse", icon: "◎", label: "analyse", hint: running ? "analysing…" : "run the engine over every ply", tone: "primary", onclick: run, disabled: busy || !loaded || Boolean(running) },
  ]);
  const panels = [
    { id: "report", label: "report" },
    { id: "moves", label: "moves" },
    { id: "elo", label: "elo" },
  ];
</script>

<Shell {terminal} {daemon} active="study" {panels} bind:panel bind:open {note} {actions} evaluation={done ? bar.toFixed(1) : null} onflip={() => (flipped = !flipped)} onkey={keys}>
  {#snippet upper()}
    <Seat at="top" name={top === "white" ? white : black} kind={top} active={loaded && (turnWhite ? top === "white" : top === "black")} />
  {/snippet}

  {#snippet board()}
    <Board {fen} orientation={flipped ? "black" : "white"} {lastMove} />
  {/snippet}

  {#snippet lower()}
    <Seat at="bottom" name={top === "white" ? black : white} kind={top === "white" ? "black" : "white"} active={loaded && (turnWhite ? top !== "white" : top !== "black")} />
  {/snippet}

  {#snippet body()}
    {#if panel === "moves"}
      <Moves sans={$data.sans ?? []} {cursor} {marks} onseek={seek} meta={loaded ? `ply ${cursor} / ${total}` : ""} empty="no game on the board" />
    {:else if panel === "elo"}
      <Ladder {ladder} label="elo of this move" move={cursor ? plyLabel(cursor) : ""} empty={done ? "walk to a move, then ≈ prices it against the limited-strength ladder." : "analyse the game first — then ≈ prices a move against the limited-strength ladder."} />
    {:else}
      <div class="stack">
        <div class="title">{$data.title || "no game loaded"}</div>
        {#if meta}<div class="meta">{meta}</div>{/if}
      </div>

      {#if done}
        <div class="accuracy">
          <div><div class="meta">white · accuracy</div><div class="figure">{report.accuracy.white}<small>%</small></div></div>
          <div><div class="meta">black · accuracy</div><div class="figure">{report.accuracy.black}<small>%</small></div></div>
        </div>
        <div class="counts meta">
          <span class="secondary">?! {count("inaccuracy")}</span>
          <span class="warning">? {count("mistake")}</span>
          <span class="danger">?? {count("blunder")}</span>
          <span>depth {report.depth} · {report.engine}</span>
        </div>
      {:else if running}
        <div class="stack">
          <div class="bar"><div class="fill" style:width="{running.total ? ((running.done / running.total) * 100).toFixed(0) : 0}%"></div></div>
          <div class="meta">/analysis/game · streaming · ply {running.done} / {running.total}</div>
        </div>
      {/if}

      {#if loaded}
        <div class="stack">
          <span class="meta ply" class:secondary={tone === "secondary"} class:warning={tone === "warning"} class:danger={tone === "danger"} class:success={tone === "success"}>
            {cursor === 0 ? "start position" : plyLabel(cursor)}{judgement && MARK[judgement.judgement] ? ` ${MARK[judgement.judgement][0]}` : ""}{judgement ? ` · ${judgement.judgement} · ${judgement.before}% → ${judgement.after}%` : ""}{judgement?.best ? ` · engine: ${judgement.best}` : ""}{judgement?.eval ? ` · ${score(judgement.eval)} ${judgement.eval.pv.slice(0, 5).join(" ")}` : ""}
          </span>
          {#if judgement}
            <div class="explain" class:secondary={tone === "secondary"} class:warning={tone === "warning"} class:danger={tone === "danger"} class:success={tone === "success"}>
              {#if explanation}
                {explanation}
              {:else}
                <button class="why" onclick={explain} disabled={asking || busy}>{asking ? "asking…" : "why?"}</button>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <div class="stack">
          <span class="label">load a game</span>
          <div class="field">
            <textarea bind:value={pgn} rows="4" placeholder="paste a PGN — or open one from the library"></textarea>
            <button onclick={load} disabled={busy || !pgn.trim()}>load</button>
          </div>
        </div>
      {/if}
    {/if}
  {/snippet}
</Shell>

<style>
  .why {
    border: none;
    background: transparent;
    color: var(--primary);
    font-family: var(--code);
    font-size: var(--font-size-sm);
    cursor: pointer;
    padding: 0;
  }
  .why:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .accuracy {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .counts {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .ply {
    line-height: 1.5;
  }
  .explain {
    font-size: var(--font-size-sm);
    line-height: 1.55;
    color: var(--t2);
    padding-left: 9px;
    border-left: 2px solid var(--b3);
    text-wrap: pretty;
  }
  .explain.secondary {
    border-color: var(--secondary);
  }
  .explain.warning {
    border-color: var(--warning);
  }
  .explain.danger {
    border-color: var(--danger);
  }
  .explain.success {
    border-color: var(--success);
  }
</style>
