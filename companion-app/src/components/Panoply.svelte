<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Ruleset } from '../rules/rules';

  // The equipment the chosen rules use: the book's gear and magic, plus custom entries.
  let { rules }: { rules: Ruleset } = $props();

  let query = $state('');
  let kind = $state<'items' | 'magic'>('items');
  let customCount = $derived(app.local.items.length + app.local.magic.length);

  let catalog = $derived.by(() => {
    // Redraw when custom equipment or the campaign changes.
    void app.sheets;
    void app.local;
    return rules.equipment;
  });

  let shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = kind === 'items'
      ? catalog.items.map((i) => ({ ref: i.ref, name: i.name, what: i.kind, page: i.page, summary: i.summary }))
      : catalog.magic.map((m) => ({ ref: m.ref, name: m.name, what: m.system, page: m.page, summary: m.summary }));
    return list.filter((e) => e.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  });
</script>

<details class="section">
  <summary><h2>Panoply</h2></summary>
  <div class="row">
    <input class="grow" type="search" bind:value={query} placeholder="Find gear or magic" aria-label="Find gear or magic" autocomplete="off" />
    <select bind:value={kind} aria-label="Show">
      <option value="items">Gear</option>
      <option value="magic">Magic</option>
    </select>
  </div>
  <ul class="entries">
    {#each shown.slice(0, 60) as e (e.ref)}
      <li>
        <strong>{e.name}</strong>
        <span class="small muted">· {e.what}{e.page ? ` · p. ${e.page}` : ''}{e.ref.startsWith('local:') ? ' · custom' : ''}</span>
        {#if e.summary}<div class="small">{e.summary}</div>{/if}
      </li>
    {:else}
      <li class="small muted">Nothing matches.</li>
    {/each}
  </ul>
  {#if shown.length > 60}<p class="small muted">Showing 60 of {shown.length}; search to narrow it down.</p>{/if}

  <section class="card" style="margin-top:0.75rem">
    <h3>Custom equipment</h3>
    <p class="small muted">
      Items, spells and dweomers your referee has approved that aren't in the book. {customCount
        ? `${customCount} entr${customCount === 1 ? 'y' : 'ies'} on this device.`
        : 'None yet.'}
    </p>
    <button onclick={() => (app.view = { name: 'equipment' })}>Edit custom equipment</button>
  </section>
</details>

<style>
  .entries { list-style: none; padding: 0; margin: 0.5rem 0 0; }
  .entries li { padding: 0.35rem 0; border-bottom: 1px solid var(--line); }
</style>
