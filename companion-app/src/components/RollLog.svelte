<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { headline, rolledLine } from '../lib/checks';

  // Every roll made on this device, newest first, from the dice page and from sheets.
  function time(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

{#if app.log.length}
  <div class="row end"><button class="ghost" onclick={() => app.clearLog()}>Clear</button></div>
{:else}
  <p class="muted small">Rolls from the dice page and from character sheets show up here.</p>
{/if}
<ul class="log">
  {#each app.log as e (e.id)}
    <li>
      <div class="row">
        <span class="grow">
          <strong>{headline(e, false)}</strong>
          {#if e.outcome}<span class="small {e.outcome}">({e.outcome})</span>{/if}
        </span>
        <span class="small muted">{time(e.at)}</span>
      </div>
      <div class="small muted"><em>{rolledLine(e)}</em></div>
      {#if app.canPost}<button class="ghost small" onclick={() => app.post(e)}>Send to Discord</button>{/if}
    </li>
  {/each}
</ul>

<style>
  .end { justify-content: flex-end; }
  .log { list-style: none; padding: 0; margin: 0; }
  .log li { border-bottom: 1px solid var(--line); padding: 0.5rem 0; }
  .log button { min-height: 32px; padding: 0.1rem 0; }
</style>
