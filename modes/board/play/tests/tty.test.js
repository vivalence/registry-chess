import { specimen, mime } from "@vivalence/typology";
import paladin from "@vivalence/paladin";

const { describe, it, expect } = specimen;

const ENTRY = new URL("../buffer/play.jsx", import.meta.url).pathname;
const STORE = Deno.makeTempDirSync({ prefix: "play-tty-" });

// the tty face: a solid-universal bundle, externals left bare for the client's import map, a
// default export that mounts into an opentui slot
describe("play view — the tty bundle", { sanitizeResources: false, sanitizeOps: false }, () => {
  it("T-bundle: play.jsx bundles as tty.solid, keeps solid-js and @opentui/solid external, loads with a mounting default", async () => {
    const bundle = await paladin.bundler(STORE).bundle({ mime: mime.tty.solid, entry: ENTRY });
    expect(bundle.entries[0].mime).toBe(mime.tty.solid);
    const files = [];
    for await (const entry of Deno.readDir(`${STORE}/bundle`)) files.push(entry.name);
    const code = await Deno.readTextFile(`${STORE}/bundle/${files.find((name) => name.endsWith(".mjs"))}`);
    await Deno.remove(STORE, { recursive: true });
    expect(code).toMatch(/from\s*"solid-js"/);
    expect(code).toMatch(/from\s*"@opentui\/solid"/);
    expect(code).not.toMatch(/from\s*"https:\/\//);
    expect(code).not.toMatch(/\.svelte/);
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const module = await import(url);
    URL.revokeObjectURL(url);
    expect(typeof module.default).toBe("function");
    expect(typeof module.Play).toBe("function");
  });
});
