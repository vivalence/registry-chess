<!--
  the chess chrome — the design's names, the theme's values. every colour here is a dapper token
  (every dapper theme alike), so a chess buffer follows anima's theme instead of freezing a palette.
  a component, not a stylesheet: the bundler keeps only the entry's JS and drops a `.css` import on
  the floor, while a component's own style is injected on mount. Shell mounts it once, first under
  `.chess`. the same file ships in every chess mode's buffer/kit/; tests/kit.test.js pins the copies.
-->
<style>
:global(.chess) {
  --s0: var(--surface);
  --s1: var(--surface-lift);
  --s2: var(--surface-sunk);
  --s3: var(--surface-lift);
  --s4: var(--control-contrast-pressed);
  --b0: var(--boundary);
  --b2: var(--boundary-soft);
  --b3: var(--boundary);
  --t1: var(--text-strong);
  --t2: var(--text-ink);
  --t3: var(--text-light);
  --primary: var(--signal-primary);
  --secondary: var(--signal-primary);
  --success: var(--signal-positive);
  --warning: var(--signal-caution);
  --danger: var(--signal-negative);
  --sq-light: var(--boundary-strong);
  --sq-dark: var(--control-contrast-pressed);
  --pw: var(--text-header);
  --pb: var(--surface-sunk);
  --pw-shadow: var(--shadow);
  --pb-shadow: color-mix(in srgb, var(--text-header) 28%, transparent);
  --hl-last: color-mix(in srgb, var(--primary) 28%, transparent);
  --hl-sel: color-mix(in srgb, var(--primary) 50%, transparent);
  --hl-dot: color-mix(in srgb, var(--t1) 35%, transparent);
  --code: var(--font-family-code);
  --sans: var(--font-family-sans-text);
  --head: var(--font-family-sans-heading);

  position: relative;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--s1);
  color: var(--t1);
  font-family: var(--sans);
  font-size: var(--font-size-md);
}
:global(.chess:focus) {
  outline: none;
}

  /* a light theme flips the zone: its surface is the light one and its contrast is ink, so the squares
     and the pieces swap which token they read — every other alias follows the theme as it is */
  :global(:root[data-theme="parchment"] .chess),
  :global(:root[data-theme="porcelain"] .chess),
  :global(:root[data-theme="datasette"] .chess) {
    --sq-light: var(--control-contrast-pressed);
    --sq-dark: var(--boundary-strong);
    --pw: var(--surface-lift);
    --pb: var(--text-header);
    --pw-shadow: color-mix(in srgb, var(--text-header) 55%, transparent);
    --pb-shadow: color-mix(in srgb, var(--surface-lift) 40%, transparent);
  }
  :global(:root[data-theme="datasette"] .chess) {
    --sq-light: var(--surface-sunk);
    --sq-dark: var(--text-light);
  }

/* ── blocks ── */
:global(.chess .stack) {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
:global(.chess .head) {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

/* ── type ── */
:global(.chess .label) {
  font-family: var(--code);
  font-size: var(--font-size-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--t3);
}
:global(.chess .meta) {
  font-family: var(--code);
  font-size: var(--font-size-xs);
  color: var(--t3);
}
:global(.chess .title) {
  font-family: var(--head);
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--t1);
  line-height: 1.3;
}
:global(.chess .figure) {
  font-family: var(--head);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--t1);
  line-height: 1.2;
}
:global(.chess .figure small) {
  font-size: var(--font-size-md);
  color: var(--t3);
}
:global(.chess .prose) {
  font-size: var(--font-size-md);
  line-height: 1.5;
  color: var(--t2);
  text-wrap: pretty;
}
:global(.chess .primary) { color: var(--primary); }
:global(.chess .secondary) { color: var(--secondary); }
:global(.chess .success) { color: var(--success); }
:global(.chess .warning) { color: var(--warning); }
:global(.chess .danger) { color: var(--danger); }
:global(.chess .support) { color: var(--t3); }

/* ── chips ── */
:global(.chess .chip) {
  flex: 0 0 auto;
  padding: 2px 7px;
  border: 1px solid var(--b0);
  border-radius: 3px;
  background: transparent;
  color: var(--t3);
  font-family: var(--code);
  font-size: var(--font-size-xs);
  line-height: 1.2;
  white-space: nowrap;
}
:global(.chess button.chip) { cursor: pointer; }
:global(.chess button.chip:hover) {
  border-color: var(--primary);
  color: var(--primary);
}
:global(.chess button.chip:disabled) { cursor: default; opacity: 0.45; }
:global(.chess .chip.on) {
  border-color: var(--primary);
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

/* ── a segmented choice: one of a few, the chosen one lit ── */
:global(.chess .segment) {
  display: flex;
  border: 1px solid var(--b0);
  border-radius: 4px;
  overflow: hidden;
  background: var(--s2);
}
:global(.chess .segment button) {
  flex: 1;
  min-width: 0;
  padding: 7px 4px;
  border: none;
  border-left: 1px solid var(--b0);
  margin-left: -1px;
  background: transparent;
  color: var(--t3);
  font-family: var(--code);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
:global(.chess .segment button:hover:not(:disabled)) { color: var(--t1); }
:global(.chess .segment button.on) {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
}
:global(.chess .segment button:disabled) { cursor: default; }

/* ── a square step button: − and + ── */
:global(.chess .step) {
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--b0);
  border-radius: 3px;
  background: transparent;
  color: var(--t2);
  font-family: var(--code);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
:global(.chess .step:hover:not(:disabled)) {
  border-color: var(--primary);
  color: var(--primary);
}
:global(.chess .step:disabled) { opacity: 0.45; cursor: default; }

/* ── inputs, bars ── */
:global(.chess .field) {
  display: flex;
  border: 1px solid var(--b0);
  border-radius: 4px;
  overflow: hidden;
  background: var(--s2);
}
:global(.chess .field input),
:global(.chess .field textarea) {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  border: none;
  background: transparent;
  color: var(--t1);
  font-family: var(--sans);
  font-size: var(--font-size-md);
  outline: none;
}
:global(.chess .field textarea) {
  font-family: var(--code);
  font-size: var(--font-size-sm);
  resize: vertical;
}
:global(.chess .field button) {
  padding: 0 14px;
  border: none;
  border-left: 1px solid var(--b0);
  background: transparent;
  color: var(--primary);
  font-family: var(--code);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
:global(.chess .field button:hover:not(:disabled)) { background: var(--s3); }
:global(.chess .field button:disabled) { opacity: 0.45; cursor: default; }
:global(.chess .bar) {
  height: 2px;
  background: var(--s3);
  border-radius: 2px;
  overflow: hidden;
}
:global(.chess .bar .fill) {
  height: 100%;
  background: var(--primary);
  transition: width 0.2s;
}
:global(.chess .fault) {
  font-family: var(--code);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--danger);
}
:global(.chess .pulse) {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: chess-pulse 1.2s ease-in-out infinite;
}
@keyframes -global-chess-pulse {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 0.7; transform: scale(1); }
}
</style>
