<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { equipment, type Character } from '../lib/character';
  import { armorEffect, byCircle, checkPreparations, knownLimit } from '../lib/magic';
  import { magicLevel, magicLevels, resolveMagic } from '../equipment/equipment';

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
  // A spent preparation is an empty slot, so only unspent ones take up room.
  function fits(circle: number) {
    const held = c.data.inventory.prepared.filter((p) => !p.spent);
    return checkPreparations(magic.slots, c.level, [...held, { circle }], armor.penalty).over.length === 0;
  }
  let allowedText = $derived(
    limits.allowed.map((n, k) => (n ? `${circleName(k + 1)} ×${n}` : '')).filter(Boolean).join(', ')
  );

  function circleName(n: number) {
    return magic.circleWord === 'Rarity' ? RARITY[n - 1] ?? `Rarity ${n}` : `${n}${['st', 'nd', 'rd'][n - 1] ?? 'th'}`;
  }

  function save() {
    app.persist();
  }

  // What the equipment files offer this class, lowest circle or rarity first.
  let catalog = $derived(
    c.rules.equipment.magicOf(magic.system).map((m) => ({ ...m, levels: magicLevels(m) })).sort((a, b) => a.levels[0] - b.levels[0] || a.name.localeCompare(b.name))
  );
  let addRef = $state('');

  function addToBook() {
    if (!addRef) return;
    const m = catalog.find((x) => x.ref === addRef);
    c.data.inventory.book.push(m ? { ref: m.ref, magic: m.name, circle: m.levels[0] } : { magic: '', circle: 1 });
    addRef = '';
    save();
  }

  const fixedLevel = (ref: string | undefined) => {
    const m = resolveMagic(ref);
    return m ? magicLevel(m) : undefined;
  };
  const levelsOf = (ref: string | undefined) => {
    const m = resolveMagic(ref);
    return m ? magicLevels(m) : circles;
  };
  const about = (ref: string | undefined) => {
    const m = resolveMagic(ref);
    return m ? `${m.tags?.length ? `${m.tags.join(' ')} · ` : ''}p. ${m.page}. ${m.summary ?? ''}` : '';
  };

  function prepare(entry?: { ref?: string; magic: string; circle: number }) {
    const prepared = c.data.inventory.prepared;
    prepared.push({ ...(entry?.ref ? { ref: entry.ref } : {}), magic: entry?.magic ?? '', circle: entry?.circle ?? 1, spent: false });
    // The new one goes into an emptied slot: clear spent ones until everything fits.
    const spent = () => prepared.map((p, i) => ({ p, i })).filter(({ p }) => p.spent).sort((a, b) => a.p.circle - b.p.circle);
    while (checkPreparations(magic.slots, c.level, prepared, armor.penalty).over.length && spent().length) {
      prepared.splice(spent()[0].i, 1);
    }
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
{#each byCircle(c.data.inventory.prepared) as { entry: p, i } (p)}
  <div class="prep" class:spent={p.spent} class:over={limits.over.includes(i)}>
    {#if fixedLevel(p.ref)}
      <span class="level">{circleName(p.circle)}</span>
    {:else}
      <select bind:value={p.circle} onchange={save} aria-label={magic.circleWord}>
        {#each levelsOf(p.ref).filter((n) => n <= limits.maxCircle || n === p.circle) as n}<option value={n}>{circleName(n)}</option>{/each}
      </select>
    {/if}
    {#if p.ref}
      <span class="named">{p.magic}</span>
    {:else}
      <input bind:value={p.magic} onchange={save} placeholder="What it holds" aria-label="Prepared magic" />
    {/if}
    <button onclick={() => use(i)} disabled={!p.spent && !!armor.blockedBy}>{p.spent ? 'Spent' : 'Use'}</button>
    <button class="ghost" aria-label="Remove" onclick={() => { c.data.inventory.prepared.splice(i, 1); save(); }}>✕</button>
  </div>
{/each}
{#if limits.over.length}
  <p class="small failure">Over the level {c.level} limit: {limits.over.length} {magic.prepared.toLowerCase()}{limits.over.length === 1 ? '' : 's'} marked in red won't fit.</p>
{/if}
<div class="row">
  <button class="ghost" onclick={() => prepare()} disabled={!fits(1)}>+ Add {magic.prepared.toLowerCase()}</button>
  {#if c.data.inventory.prepared.some((p) => p.spent)}<button onclick={renew}>Renew at sunrise/sunset</button>{/if}
</div>

<details open={c.data.inventory.book.length > 0}>
  <summary><strong>{magic.book}</strong> <span class="small muted" class:failure={knownMax != null && c.data.inventory.book.length > knownMax}>({c.data.inventory.book.length}{knownMax != null ? ` of ${knownMax}` : ''})</span></summary>
  {#if knownMax != null && c.data.inventory.book.length > knownMax}
    <p class="small failure">Level {c.level} can know {knownMax}; forget one for each new glamour or wild shape.</p>
  {/if}
  {#each byCircle(c.data.inventory.book) as { entry: b, i } (b)}
    <div class="prep">
      {#if fixedLevel(b.ref)}
        <span class="level">{circleName(b.circle)}</span>
      {:else}
        <select bind:value={b.circle} onchange={save} aria-label={magic.circleWord}>
          {#each levelsOf(b.ref) as n}<option value={n}>{circleName(n)}</option>{/each}
        </select>
      {/if}
      {#if b.ref}
        <span class="named">{b.magic}</span>
      {:else}
        <input bind:value={b.magic} onchange={save} placeholder="Name" aria-label="Book entry" />
      {/if}
      <button onclick={() => prepare(b)} disabled={!fits(b.circle)}>Prepare</button>
      <button class="ghost" aria-label="Remove" onclick={() => { c.data.inventory.book.splice(i, 1); save(); }}>✕</button>
    </div>
    {#if about(b.ref)}<p class="small muted about">{about(b.ref)}</p>{/if}
  {/each}
  {#if catalog.length}
    <select bind:value={addRef} onchange={addToBook} disabled={knownFull} aria-label="Add to {magic.book.toLowerCase()}">
      <option value="">+ Add to {magic.book.toLowerCase()}…</option>
      {#each circles as n}
        {#if catalog.some((m) => m.levels[0] === n)}
          <optgroup label={circleName(n)}>
            {#each catalog.filter((m) => m.levels[0] === n) as m}<option value={m.ref}>{m.name}{m.tags?.length ? ` (${m.tags.join(' ')})` : ''}</option>{/each}
          </optgroup>
        {/if}
      {/each}
      <option value="custom">Something else…</option>
    </select>
  {:else}
    <button class="ghost" disabled={knownFull} onclick={() => { c.data.inventory.book.push({ magic: '', circle: 1 }); save(); }}>+ Add to {magic.book.toLowerCase()}</button>
  {/if}
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
  .level, .named { align-self: center; }
  .level { font-size: 0.85rem; color: var(--muted); padding-left: 0.3rem; }
  .named { font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
  .about { margin: -0.15rem 0 0.5rem; }
  .spent input, .spent select, .spent .named, .spent .level { opacity: 0.5; text-decoration: line-through; }
  .over select, .over input { border-color: var(--bad); color: var(--bad); }
  details { margin-top: 0.75rem; }
  summary { cursor: pointer; min-height: 32px; }
</style>
