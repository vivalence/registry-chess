<script>
  import { onMount } from "svelte";
  import { open, TABS } from "./open.js";

  // the ♞ bar every chess buffer wears: five tabs, one per mode on this daemon, and the engine
  // dot. a tab opens the sibling mode's newest thread and buffer, or mints them (open.js). the
  // status door never spawns the engine, so the dot is one read at mount, never a subscription.
  // `narrow` folds the knight and the dot's word away, the way Shell measures the buffer.
  const { terminal, daemon, active, narrow = false } = $props();

  let status = $state(null);
  let fault = $state(null);
  let opening = $state(null);

  onMount(async () => {
    try {
      status = await daemon.connection.call("/engine/status", {});
    } catch (error) {
      fault = `engine · ${error.message}`;
    }
  });

  const go = async (tab) => {
    if (opening || tab.type === active) return;
    opening = tab.type;
    try {
      await open(terminal, daemon, tab);
      fault = null;
    } catch (error) {
      fault = `${tab.label} · ${error.message}`;
    } finally {
      opening = null;
    }
  };

  const hint = $derived(
    !status
      ? "engine · asking the daemon"
      : status.present
        ? [status.engine ?? status.binary ?? "engine", status.threads && `${status.threads} threads`, status.hash && `${status.hash} mb`, status.started ? "running" : "not started yet"].filter(Boolean).join(" · ")
        : status.message,
  );
</script>

<nav class="nav" class:narrow>
  {#if !narrow}<span class="brand">♞</span>{/if}
  {#each TABS as tab (tab.type)}
    <button class="tab" class:active={tab.type === active} class:busy={opening === tab.type} disabled={opening !== null} title={`${tab.label} mode`} onclick={() => go(tab)}>{tab.label}</button>
  {/each}
  {#if fault}<span class="fault">{fault}</span>{/if}
  <span class="engine" title={hint}>
    <span class="dot" class:on={status?.present === true} class:off={status?.present === false}></span>{#if !narrow}engine{/if}
  </span>
</nav>

<style>
  .nav {
    display: flex;
    align-items: stretch;
    height: 40px;
    flex: none;
    border-bottom: 1px solid var(--b0);
    background: var(--s2);
  }
  .brand {
    display: flex;
    align-items: center;
    padding: 0 11px;
    border-right: 1px solid var(--b0);
    color: var(--t1);
    font-size: var(--font-size-md);
    line-height: 1;
  }
  .tab {
    flex: 0 1 auto;
    min-width: 0;
    padding: 0 11px;
    border: none;
    border-right: 1px solid var(--b0);
    background: transparent;
    color: var(--t3);
    font-family: var(--code);
    font-size: var(--font-size-sm);
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .narrow .tab {
    padding: 0 7px;
    font-size: var(--font-size-xs);
  }
  .tab:hover:not(:disabled) {
    color: var(--t1);
  }
  .tab.active {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    box-shadow: inset 0 -2px 0 var(--primary);
  }
  .tab.busy {
    color: var(--primary);
  }
  .tab:disabled {
    cursor: default;
  }
  .fault {
    align-self: center;
    min-width: 0;
    padding: 0 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--danger);
    font-family: var(--code);
    font-size: var(--font-size-xs);
  }
  .engine {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    color: var(--t3);
    font-family: var(--code);
    font-size: var(--font-size-xs);
    white-space: nowrap;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--b3);
  }
  .dot.on {
    background: var(--success);
    box-shadow: 0 0 5px var(--success);
  }
  .dot.off {
    background: var(--danger);
    box-shadow: 0 0 5px var(--danger);
  }
</style>
