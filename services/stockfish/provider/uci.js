// a UCI engine process: spawn lazily, speak lines, one search at a time.

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const parseInfo = (line) => {
  const tokens = line.split(/\s+/);
  const info = { multipv: 1 };
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "depth") info.depth = Number(tokens[++index]);
    else if (token === "seldepth") info.seldepth = Number(tokens[++index]);
    else if (token === "multipv") info.multipv = Number(tokens[++index]);
    else if (token === "nodes") info.nodes = Number(tokens[++index]);
    else if (token === "nps") info.nps = Number(tokens[++index]);
    else if (token === "time") info.time = Number(tokens[++index]);
    else if (token === "score") {
      const kind = tokens[++index];
      const value = Number(tokens[++index]);
      if (kind === "cp") info.cp = value;
      if (kind === "mate") info.mate = value;
      while (["lowerbound", "upperbound"].includes(tokens[index + 1])) info.bound = tokens[++index];
    } else if (token === "pv") {
      info.pv = tokens.slice(index + 1);
      break;
    }
  }
  return info;
};

export class Engine {
  #process = null;
  #writer = null;
  #listeners = new Set();
  #queue = Promise.resolve();
  #closed = false;
  name = null;

  constructor({ binary = "stockfish", args = [], options = {} } = {}) {
    this.binary = binary;
    this.args = args;
    this.options = options;
  }

  get started() {
    return this.#process !== null;
  }

  async #spawn() {
    if (this.#process) return;
    let process;
    try {
      process = new Deno.Command(this.binary, { args: this.args, stdin: "piped", stdout: "piped", stderr: "null" }).spawn();
    } catch (error) {
      throw new Error(`[stockfish] cannot start "${this.binary}" — ${error.message}. install it (brew install stockfish) or point VIVA_SERVICE_STOCKFISH_BINARY at a UCI engine`);
    }
    this.#process = process;
    this.#writer = process.stdin.getWriter();
    this.#read(process.stdout).catch(() => {});
    process.status.then(() => {
      this.#process = null;
      this.#writer = null;
    });
    await this.#handshake();
  }

  async #read(stdout) {
    let held = "";
    for await (const chunk of stdout) {
      held += decoder.decode(chunk, { stream: true });
      let cut;
      while ((cut = held.indexOf("\n")) >= 0) {
        const line = held.slice(0, cut).replace(/\r$/, "");
        held = held.slice(cut + 1);
        for (const listener of this.#listeners) listener(line);
      }
    }
  }

  #listen(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  // await one line matching `pattern`, collecting every line on the way through `collect`
  #until(pattern, collect = null, timeout = 60_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`[stockfish] no ${pattern} within ${timeout}ms`));
      }, timeout);
      const stop = this.#listen((line) => {
        collect?.(line);
        if (pattern.test(line)) {
          clearTimeout(timer);
          stop();
          resolve(line);
        }
      });
    });
  }

  async send(line) {
    await this.#writer.write(encoder.encode(line + "\n"));
  }

  async #handshake() {
    const named = this.#until(/^uciok/, (line) => {
      const match = line.match(/^id name (.+)$/);
      if (match) this.name = match[1];
    });
    await this.send("uci");
    await named;
    for (const [option, value] of Object.entries(this.options)) await this.send(`setoption name ${option} value ${value}`);
    await this.ready();
  }

  async ready() {
    const ready = this.#until(/^readyok/);
    await this.send("isready");
    await ready;
  }

  // one search at a time: the queue serialises callers, the engine never sees two `go`s.
  run(task) {
    const turn = this.#queue.then(async () => {
      if (this.#closed) throw new Error("[stockfish] engine closed");
      await this.#spawn();
      return task();
    });
    this.#queue = turn.catch(() => {});
    return turn;
  }

  // the search itself: position, go, then every info line as it arrives, until bestmove.
  async *search({ fen, depth, movetime, multipv = 1, options = {} }) {
    await this.send("ucinewgame");
    for (const [option, value] of Object.entries({ MultiPV: multipv, ...options })) await this.send(`setoption name ${option} value ${value}`);
    await this.ready();
    await this.send(`position fen ${fen}`);
    const lines = [];
    let done = false;
    let bestmove = null;
    let wake = null;
    const stop = this.#listen((line) => {
      if (line.startsWith("info ") && line.includes(" pv ")) lines.push(parseInfo(line));
      else if (line.startsWith("bestmove")) {
        const [, move, , ponder] = line.split(/\s+/);
        bestmove = { uci: move, ponder: ponder ?? null };
        done = true;
      }
      wake?.();
    });
    const go = depth ? `go depth ${depth}` : `go movetime ${movetime ?? 1000}`;
    await this.send(go);
    try {
      while (!done || lines.length) {
        if (lines.length) {
          yield { kind: "info", ...lines.shift() };
          continue;
        }
        await new Promise((resolve) => (wake = resolve));
        wake = null;
      }
      yield { kind: "bestmove", ...bestmove };
    } finally {
      stop();
      if (!done) await this.send("stop").catch(() => {});
    }
  }

  async stop() {
    if (this.#writer) await this.send("stop").catch(() => {});
  }

  async close() {
    this.#closed = true;
    if (this.#writer) await this.send("quit").catch(() => {});
    try {
      this.#process?.kill();
    } catch {
      // already gone
    }
  }
}
