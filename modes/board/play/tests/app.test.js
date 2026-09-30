import { specimen } from "@vivalence/typology";
import paladin from "@vivalence/paladin";

const { describe, it, expect } = specimen;

const ENTRY = new URL("../buffer/Play.svelte", import.meta.url).pathname;
const STORE = `${Deno.makeTempDirSync({ prefix: "chess-play-" })}`;

// the bundle: builds, carries the mode's own board and nav, reaches nothing over https, and no
// longer carries chessground. what the view PRINTS is pinned in match.test.js (P-render).
describe("play view — the bundle", { sanitizeResources: false, sanitizeOps: false }, () => {
  it("P-bundle: Play.svelte bundles with its kit inside and no chessground, no external https import", async () => {
    const view = await paladin.bundler(STORE).bundle({ kind: "svelte", entry: ENTRY });
    expect(view.kind).toBe("svelte");
    expect(view.hash).toBeTruthy();
    const files = [];
    for await (const entry of Deno.readDir(`${STORE}/bundle`)) files.push(entry.name);
    const code = await Deno.readTextFile(`${STORE}/bundle/${files.find((name) => name.endsWith(".mjs"))}`);
    expect(code).toMatch(/♞|\\u265e/i); // esbuild escapes the knight
    expect(code).toContain("/engine/status");
    expect(code).toContain("--sq-light:");
    await Deno.remove(STORE, { recursive: true });
    expect(code).not.toMatch(/chessground/);
    expect(code).not.toMatch(/from\s*"https:\/\//);
  });
});
