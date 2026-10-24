<script lang="ts">
  import { app } from '../lib/app.svelte';

  let entry = $derived(app.lastRoll);
</script>

{#if entry}
  <div class="result card no-print" role="status" aria-live="polite">
    <div class="row">
      <div class="grow">
        <div class="small muted">{entry.who} · {entry.label}</div>
        <div class="big">
          {entry.total}
          {#if entry.outcome}
            <span class={entry.outcome}>{entry.outcome === 'critical' ? 'Critical!' : entry.outcome === 'success' ? 'Success' : 'Failure'}</span>
          {/if}
        </div>
        <div class="small muted">{entry.detail.replace(/~~(\d+)~~/g, '($1)')}</div>
      </div>
      <div class="actions">
        {#if app.canPost && !app.settings.autoPost}
          <button onclick={() => app.post(entry!)}>Discord</button>
        {/if}
        <button class="ghost" aria-label="Dismiss" onclick={() => (app.lastRoll = null)}>✕</button>
      </div>
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
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
</style>
