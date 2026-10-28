<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { damageLine, rolledLine } from '../lib/checks';

  let entry = $derived(app.lastRoll);
  let box = $state<HTMLElement>();

  // Any tap outside the result, or Escape, puts it away.
  function outside(ev: PointerEvent) {
    if (entry && box && !box.contains(ev.target as Node)) app.lastRoll = null;
  }
  function key(ev: KeyboardEvent) {
    if (entry && ev.key === 'Escape') app.lastRoll = null;
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={key} />

{#if entry}
  <div class="result card no-print" role="status" aria-live="polite" bind:this={box}>
    <div class="row">
      <div class="grow">
        <div class="small muted">{entry.who} · {entry.difficulty && entry.difficulty !== 'normal' ? `${entry.difficulty[0].toUpperCase()}${entry.difficulty.slice(1)} ` : ''}{entry.label}</div>
        <div class="big">
          {entry.total}
          {#if entry.outcome}
            <span class={entry.outcome}>{entry.outcome === 'critical' ? 'Critical!' : entry.outcome === 'success' ? 'Success' : 'Failure'}</span>
          {/if}
        </div>
        {#if entry.parts?.length}<div class="parts">{damageLine(entry)}</div>{/if}
        <div class="small muted"><em>{rolledLine(entry)}</em></div>
      </div>
      {#if app.canPost && !app.settings.autoPost}
        <div class="actions">
          <button onclick={() => app.post(entry!)}>Discord</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .result {
    position: fixed;
    left: 16px;
    right: 16px;
    max-width: 608px;
    margin: 0 auto;
    bottom: calc(68px + env(safe-area-inset-bottom));
    z-index: 20;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.2);
  }
  .big {
    font-size: 1.8rem;
    font-weight: 700;
    font-family: Georgia, serif;
  }
  .big span {
    font-size: 1rem;
    margin-left: 0.4rem;
  }
  .parts {
    font-weight: 600;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
</style>
