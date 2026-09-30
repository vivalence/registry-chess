import { specimen } from "@vivalence/typology";
import { join } from "@std/path";
import { hello } from "@vivalence/runtime/scenarios";

const { describe, it, expect, beforeAll, afterAll } = specimen;

// this package, wherever its registry store is — the ledger below names it, never ~/.viva
const PACKAGE = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const GHOST = join(hello.REPOSITORY, "systems/ghost/run.js");
const RUN = join(hello.REPOSITORY, "systems/runtime/run.js");
const CONFIG = join(hello.REPOSITORY, "deno.jsonc");
const READY = /^Status:RUNNING$/;
const CARRIED = ["PATH", "TMPDIR", "TERM", "LANG", "DENO_DIR", "NO_COLOR"];

const RECIPE = {
  manifest: { type: "instance", slug: "chess-boot", version: "0.0.1" },
  runtime: {
    manifest: { slug: "house" },
    statics: { serve: "${VIVA_RUNTIME_SERVE}", remote: "${VIVA_RUNTIME_SERVE}" },
    secrets: { jwt: "${SECRET_VIVA_JWT}" },
    modes: [],
  },
  lighthouse: { secrets: { jwt: "${SECRET_VIVA_JWT}" }, traits: ["JOINABLE"] },
  datamap: { module: "@commons/datamap/libsql" },
  hallucinators: [],
  clients: [{ manifest: { type: "client", slug: "ghost" }, modes: [] }],
  services: [],
  daemons: [
    {
      manifest: { type: "daemon", slug: "chess", version: "0.0.1" },
      modes: ["@chess/domain/chess", "@chess/topology/game", "@chess/topology/position", "@chess/topology/opening", "@chess/topology/puzzle", "@chess/board/play"],
    },
  ],
  environment: {
    type: "object",
    required: ["VIVA_RUNTIME_SERVE", "SECRET_VIVA_JWT"],
    properties: {
      VIVA_RUNTIME_SERVE: { type: "string", description: "Base URL the runtime serves on." },
      SECRET_VIVA_JWT: { type: "string", minLength: 24, description: "The runtime's signing secret." },
    },
    additionalProperties: false,
  },
};

const carried = () => Object.fromEntries(CARRIED.filter((key) => Deno.env.has(key)).map((key) => [key, Deno.env.get(key)]));

// a world of its own: an empty HOME, a ledger whose registry names this package beside @commons — the way
// systems/runtime/tests/scenarios/hello.js points the repo's rigs at its fixtures
async function world() {
  const root = await Deno.makeTempDir({ prefix: "viva-chess-boot-" });
  await Deno.mkdir(join(root, "home"));
  await Deno.mkdir(join(root, "instance/mountpoint"), { recursive: true });
  await hello.copy(hello.LEDGER, join(root, "ledger"));
  await Deno.writeTextFile(join(root, "instance/instance.viva.json"), JSON.stringify(RECIPE, null, 2));
  await Deno.writeTextFile(join(root, "ledger/instances.json"), `${JSON.stringify({ [RECIPE.manifest.slug]: { mount: join(root, "instance") } })}\n`);
  await Deno.writeTextFile(
    join(root, "ledger/registry.json"),
    `${JSON.stringify({ "@commons": { slug: "commons", mount: join(hello.REPOSITORY, "commons") }, "@chess": { slug: "chess", mount: PACKAGE } })}\n`,
  );
  const port = hello.free();
  const origin = `http://localhost:${port}`;
  const env = {
    ...carried(),
    HOME: join(root, "home"),
    XDG_CONFIG_HOME: join(root, "home"),
    VIVA_INSTANCE_MOUNT: join(root, "instance"),
    VIVA_LEDGER_MOUNT: join(root, "ledger"),
    VIVA_REPOSITORY_MOUNT: hello.REPOSITORY,
    VIVA_REGISTRY_MOUNT: join(root, "ledger/registry"),
    VIVA_RUNTIME_ORIGIN: origin,
    VIVA_RUNTIME_SERVE: `${origin}/`,
    PUBLIC_VIVA_RUNTIME_REMOTE: `${origin}/`,
    VIVA_CLIENT_ANIMA_ORIGIN: "http://localhost:1794",
    VIVA_CLIENT_ANIMA_SERVE: "http://localhost:1794/",
    SECRET_VIVA_JWT: hello.SECRET,
  };
  return { root, origin, env, remove: () => Deno.remove(root, { recursive: true }).catch(() => {}) };
}

async function boot(held, deadline = 120_000) {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-check", "--config", CONFIG, RUN],
    cwd: join(held.root, "instance"),
    env: held.env,
    clearEnv: true,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const log = [];
  let settled = false;
  let timer;
  let drained;
  const outcome = await new Promise((resolve) => {
    drained = Promise.all([
      hello.lines(child.stdout, (line) => {
        log.push(line);
        if (READY.test(line.trim())) resolve({ ready: line.trim(), code: null });
      }),
      hello.lines(child.stderr, (line) => log.push(line)),
    ]);
    child.status.then((exit) => !settled && resolve({ ready: null, code: exit.code }));
    timer = setTimeout(() => resolve({ ready: null, code: "DEADLINE" }), deadline);
  });
  settled = true;
  clearTimeout(timer);
  const tail = () => log.slice(-30).join("\n");
  const call = async (path, body, token) => {
    const response = await fetch(`${held.origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
    const parsed = await response.json();
    if (!response.ok) throw new Error(`${path} ${response.status} ${JSON.stringify(parsed)}`);
    return parsed;
  };
  const stop = async (signal = "SIGTERM") => {
    if (outcome.code !== null) return outcome.code;
    try {
      child.kill(signal);
    } catch {
      return (await child.status).code;
    }
    const exit = await child.status;
    await drained;
    return exit.code;
  };
  return { ready: outcome.ready, tail, call, stop };
}

const viva = async (held, args) => {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-check", "--config", CONFIG, GHOST, ...args],
    cwd: held.root,
    env: held.env,
    clearEnv: true,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code, out: new TextDecoder().decode(stdout), err: new TextDecoder().decode(stderr) };
};

describe("boot — this package on a ledger of its own: the chess daemon mounts, board/play seats a thread and ships its two views", { sanitizeResources: false, sanitizeOps: false }, () => {
  let held;
  let runtime;
  let learner;

  beforeAll(async () => {
    held = await world();
  });

  afterAll(async () => {
    await runtime?.stop("SIGKILL");
    await held?.remove();
  });

  it("viva --help on this ledger prints the three shell verbs and exits 0", async () => {
    const { code, out, err } = await viva(held, ["--help"]);
    expect([code, err.includes("Error")]).toEqual([0, false]);
    for (const verb of ["help", "repl", "chrome"]) expect(out).toContain(verb);
  });

  it("run.js on the instance says Status:RUNNING", async () => {
    runtime = await boot(held);
    expect(runtime.ready ?? runtime.tail()).toBe("Status:RUNNING");
  });

  it("/mode chess/board seats: a thread on board/play, the mode's two views bundled — Play.svelte for the dom, play.jsx for the tty", async () => {
    const signup = await runtime.call("/lighthouse/signup", { username: "finn", password: "hunter22hunter22" });
    expect(signup.status).toBe("SUCCESS");
    learner = signup.authority.access;
    const [play] = await runtime.call("/daemon/chess/entities/mode/find", { where: { type: "board", slug: "play" } }, learner);
    expect(play.traits).toContain("VIEWABLE");
    const thread = await runtime.call("/userspace/entities/thread/create", { data: { mode: play.id } }, learner);
    expect(thread.mode.id ?? thread.mode).toBe(play.id);
    const views = await runtime.call("/userspace/entities/view/find", { where: { mode: play.id } }, learner);
    expect(views.map((view) => view.mime).sort()).toEqual(["application/vnd.viva.dom.svelte+javascript", "application/vnd.viva.tty.solid+javascript"]);
    expect(views.every((view) => view.slug === "play")).toBe(true);
  });

  it("SIGTERM → exit 0", async () => {
    expect(await runtime.stop("SIGTERM")).toBe(0);
  });
});
