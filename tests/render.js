// server-render a mode view with a live row — the check a compile cannot make: what the template
// PRINTS. compiles the view and every .svelte beside it (its kit) with generate: "server" into a
// temp dir, rewrites the imports the bundler would resolve, imports the entry and renders it with
// the props anima's Frame hands a view: { terminal, daemon, mode, thread, buffer }.
//
// run from the repo root (`deno test --config deno.jsonc …`) so svelte resolves through the import
// map; the server entry is the bare npm specifier because the map carries no `svelte/server`.
import { compile } from "svelte/compiler";
import { render } from "npm:svelte@5.39.6/server";
import { atom } from "nanostores";

// the map's exact `svelte` entry resolves; its `svelte/internal/` PREFIX does not (deno cannot
// prefix-map an npm: specifier), so the server internals are spelled from the exact one.
const SVELTE = import.meta.resolve("svelte"); // …/svelte/src/index-server.js under deno
const SERVER = new URL("./internal/server/index.js", SVELTE).href;

const walk = async (dir, out = []) => {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) await walk(path, out);
    else if (entry.name.endsWith(".svelte") || entry.name.endsWith(".js")) out.push(path);
  }
  return out;
};

// compile one view's directory (the view + kit/*) into `store`; returns the entry's compiled url.
// css is left external: a server render prints markup, and tests/kit.test.js pins that the CLIENT
// bundle carries the theme
export async function build(entry, store) {
  const dir = entry.slice(0, entry.lastIndexOf("/"));
  for (const file of await walk(dir)) {
    const relative = file.slice(dir.length + 1);
    const name = relative.replace(/\.svelte$/, "");
    // a plain module beside the views (the kit's open.js) ships as it is
    if (file.endsWith(".js")) {
      const target = `${store}/${relative}`;
      await Deno.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
      await Deno.copyFile(file, target);
      continue;
    }
    const out = compile(await Deno.readTextFile(file), { generate: "server", filename: relative, css: "external" });
    let code = out.js.code;
    code = code.replace(/from ['"]svelte\/internal\/server['"]/g, `from "${SERVER}"`);
    code = code.replace(/from ['"]svelte['"]/g, `from "${SVELTE}"`);
    code = code.replace(/from ['"](\.\/[^'"]+)\.svelte['"]/g, (_, path) => `from "${path}.js"`);
    const target = `${store}/${name}.js`;
    await Deno.mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(target, code);
  }
  return `file://${store}/${entry.slice(dir.length + 1).replace(/\.svelte$/, "")}.js`;
}

// the props a view receives, from a buffer row (or plain data): stores where the view expects
// stores, a mode whose `call` never answers (SSR runs no effect and awaits nothing).
export function props({ buffer = null, data = null, mode = {}, thread = null, daemon = null, terminal = null } = {}) {
  const row = buffer ?? { id: "buffer-ssr", data: data ?? {} };
  const never = new Proxy(() => new Promise(() => {}), { get: (_, key) => (key === "then" ? undefined : never) });
  return {
    terminal: terminal ?? { thread, buffer: row, setDockCollapsed() {} },
    daemon: daemon ?? { connection: { call: () => new Promise(() => {}) }, entities: { mode: { $entities: atom([]) }, thread: { $entities: atom([]) } } },
    mode: { id: "mode-ssr", call: never, ...mode },
    thread: thread ?? { id: "thread-ssr", $turns: atom([]) },
    buffer: { id: row.id, $data: atom(row.data ?? {}), mount() {}, ...row },
  };
}

// `raw` hands `given` to the component as its props verbatim (a kit component); otherwise
// `given` describes a view's row and props() shapes it the way the Frame would.
export async function renderView(entry, given = {}, { store = null, raw = false } = {}) {
  const dir = store ?? (await Deno.makeTempDir({ prefix: "chess-ssr-" }));
  const url = await build(entry, dir);
  const module = await import(url);
  if (!store) await Deno.remove(dir, { recursive: true });
  const { body, head } = render(module.default, { props: raw ? given : props(given) });
  return { body, head, text: body.replace(/<!--[^]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
}
