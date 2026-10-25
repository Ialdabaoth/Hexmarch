<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Character } from '../lib/character';
  import { checkPreparations } from '../lib/magic';

  let { character: c }: { character: Character } = $props();

  let magic = $derived(c.rules.getClass(c.classId).magic!);
  const RARITY = ['Common', 'Uncommon', 'Rare', 'Legendary'];
  let circles = $derived(magic.circleWord === 'Rarity' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5]);
  // What this level may prepare, and which preparations don't fit it.
  let limits = $derived(checkPreparations(magic.slots, c.level, c.data.inventory.prepared));
  let room = $derived(c.data.inventory.prepared.length < limits.allowed.reduce((a, b) => a + b, 0));
  let allowedText = $derived(
    limits.allowed.map((n, k) => (n ? `${n} ${circleName(k + 1).toLowerCase()}` : '')).filter(Boolean).join(', ')
  );

  function circleName(n: number) {
    return magic.circleWord === 'Rarity' ? RARITY[n - 1] ?? `Rarity ${n}` : `${n}${['st', 'nd', 'rd'][n - 1] ?? 'th'}`;
  }

  function save() {
    app.persist();
  }

  function prepare(entry?: { magic: string; circle: number }) {
    c.data.inventory.prepared.push({ magic: entry?.magic ?? '', circle: entry?.circle ?? 1, spent: false });
    save();
  }

  function use(i: number) {
    const p = c.data.inventory.prepared[i];
    if (!p) return;
    p.spent = !p.spent;
    save();
    if (p.spent) app.notify(`${magic.prepared} used: ${p.magic || 'unnamed'}`);
  }

  // Sunrise or sunset: spent preparations are made again.
  function renew() {
    for (const p of c.data.inventory.prepared) p.spent = false;
    save();
    app.notify('Preparations renewed');
  }
</script>

<h2>Magic</h2>
<p class="small muted">{magic.prepared}s are physical items you carry; they go in the exported inventory.</p>

<h3>{magic.prepared}s</h3>
<p class="small muted">Level {c.level}: {allowedText}. Lower {magic.circleWord === 'Rarity' ? 'rarities' : 'circles'} can go in higher slots.</p>
{#each c.data.inventory.prepared as p, i}
  <div class="prep" class:spent={p.spent} class:over={limits.over.includes(i)}>
    <select bind:value={p.circle} onchange={save} aria-label={magic.circleWord}>
      {#each circles.filter((n) => n <= limits.maxCircle || n === p.circle) as n}<option value={n}>{circleName(n)}</option>{/each}
    </select>
    <input bind:value={p.magic} onchange={save} placeholder="What it holds" aria-label="Prepared magic" />
    <button onclick={() => use(i)}>{p.spent ? 'Spent' : 'Use'}</button>
    <button class="ghost" aria-label="Remove" onclick={() => { c.data.inventory.prepared.splice(i, 1); save(); }}>✕</button>
  </div>
{/each}
{#if limits.over.length}
  <p class="small failure">Over the level {c.level} limit: {limits.over.length} {magic.prepared.toLowerCase()}{limits.over.length === 1 ? '' : 's'} marked in red won't fit.</p>
{/if}
<div class="row">
  <button class="ghost" onclick={() => prepare()} disabled={!room}>+ Add {magic.prepared.toLowerCase()}</button>
  {#if c.data.inventory.prepared.some((p) => p.spent)}<button onclick={renew}>Renew at sunrise/sunset</button>{/if}
</div>

<details open={c.data.inventory.book.length > 0}>
  <summary><strong>{magic.book}</strong> <span class="small muted">({c.data.inventory.book.length})</span></summary>
  {#each c.data.inventory.book as b, i}
    <div class="prep">
      <select bind:value={b.circle} onchange={save} aria-label={magic.circleWord}>
        {#each circles as n}<option value={n}>{circleName(n)}</option>{/each}
      </select>
      <input bind:value={b.magic} onchange={save} placeholder="Name" aria-label="Book entry" />
      <button onclick={() => prepare(b)} disabled={!room || b.circle > limits.maxCircle}>Prepare</button>
      <button class="ghost" aria-label="Remove" onclick={() => { c.data.inventory.book.splice(i, 1); save(); }}>✕</button>
    </div>
  {/each}
  <button class="ghost" onclick={() => { c.data.inventory.book.push({ magic: '', circle: 1 }); save(); }}>+ Add to {magic.book.toLowerCase()}</button>
</details>

<style>
  h3 { margin-top: 0.5rem; }
  .prep {
    display: grid;
    grid-template-columns: 7.6rem 1fr auto auto;
    gap: 0.3rem;
    margin-bottom: 0.35rem;
  }
  .prep select, .prep input { min-width: 0; }
  .prep button { padding: 0.3rem 0.6rem; }
  .spent input, .spent select { opacity: 0.5; text-decoration: line-through; }
  .over select, .over input { border-color: var(--bad); color: var(--bad); }
  details { margin-top: 0.75rem; }
  summary { cursor: pointer; min-height: 32px; }
</style>
