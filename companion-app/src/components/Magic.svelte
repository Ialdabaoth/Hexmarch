<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { equipment, type Character } from '../lib/character';
  import { armorEffect, checkPreparations, knownLimit } from '../lib/magic';

  let { character: c }: { character: Character } = $props();

  let magic = $derived(c.rules.getClass(c.classId).magic!);
  const RARITY = ['Common', 'Uncommon', 'Rare', 'Legendary'];
  let circles = $derived(magic.circleWord === 'Rarity' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5]);
  // What this level may prepare, and which preparations don't fit it.
  let gear = $derived(equipment(c));
  let armor = $derived(armorEffect(magic.armor, gear.worn?.type, !!(gear.main?.shield || gear.off?.shield)));
  let limits = $derived(checkPreparations(magic.slots, c.level, c.data.inventory.prepared, armor.penalty));
  // Druids can only know so many glamours.
  let knownMax = $derived(knownLimit(magic.known, c.level));
  let knownFull = $derived(knownMax != null && c.data.inventory.book.length >= knownMax);
  let room = $derived(c.data.inventory.prepared.length < limits.allowed.reduce((a, b) => a + b, 0));
  let allowedText = $derived(
    limits.allowed.map((n, k) => (n ? `${circleName(k + 1)} ×${n}` : '')).filter(Boolean).join(', ')
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
<p class="small muted">Level {c.level}: {allowedText || 'none'}{armor.penalty.length ? ' (less for light armor)' : ''}. Lower {magic.circleWord === 'Rarity' ? 'rarities' : 'circles'} can go in higher slots.</p>
{#if armor.blockedBy}<p class="small failure">You can't cast your {magic.prepared.toLowerCase()}s while wearing {armor.blockedBy}.</p>{/if}
{#each c.data.inventory.prepared as p, i}
  <div class="prep" class:spent={p.spent} class:over={limits.over.includes(i)}>
    <select bind:value={p.circle} onchange={save} aria-label={magic.circleWord}>
      {#each circles.filter((n) => n <= limits.maxCircle || n === p.circle) as n}<option value={n}>{circleName(n)}</option>{/each}
    </select>
    <input bind:value={p.magic} onchange={save} placeholder="What it holds" aria-label="Prepared magic" />
    <button onclick={() => use(i)} disabled={!p.spent && !!armor.blockedBy}>{p.spent ? 'Spent' : 'Use'}</button>
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
  <summary><strong>{magic.book}</strong> <span class="small muted" class:failure={knownMax != null && c.data.inventory.book.length > knownMax}>({c.data.inventory.book.length}{knownMax != null ? ` of ${knownMax}` : ''})</span></summary>
  {#if knownMax != null && c.data.inventory.book.length > knownMax}
    <p class="small failure">Level {c.level} can know {knownMax}; forget one for each new glamour or wild shape.</p>
  {/if}
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
  <button class="ghost" disabled={knownFull} onclick={() => { c.data.inventory.book.push({ magic: '', circle: 1 }); save(); }}>+ Add to {magic.book.toLowerCase()}</button>
  {#if knownFull && knownMax === c.data.inventory.book.length}<span class="small muted">Full for level {c.level}: forget one to learn another.</span>{/if}
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
