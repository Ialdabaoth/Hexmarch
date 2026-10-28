<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Enchantment } from '../lib/gear';
  import type { Catalog, MagicEntry, Rarity } from '../equipment/equipment';
  import { RARITIES, magicLevel, magicLevels, resolveMagic } from '../equipment/equipment';
  import { ELEMENTS, describeEffect, enchantmentRarity } from '../lib/magic-effects';

  // The enchantment box on an item: a dweomer from the equipment file (which makes the
  // item a magic item) or anything written in.
  let { item, catalog, forms }: { item: { enchantment?: Enchantment }; catalog: Catalog; forms: MagicEntry['form'][] } = $props();

  let choices = $derived(catalog.magicOf('dweomer').filter((m) => forms.includes(m.form)).sort((a, b) => a.name.localeCompare(b.name)));
  let e = $derived(item.enchantment);
  let entry = $derived(resolveMagic(e?.ref));
  let levels = $derived(entry ? magicLevels(entry) : []);
  let effects = $derived(e && entry?.effects ? entry.effects.map((x) => describeEffect(x, enchantmentRarity(e, entry), e.element)) : []);
  // An elemental item's element is chosen when it's made.
  let elemental = $derived(!!entry?.effects?.some((x) => JSON.stringify(x).includes('"elemental"')));

  const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary'];
  const label = (r: Rarity | undefined) => (r ? RARITY_NAMES[RARITIES.indexOf(r)] : '');

  function save() {
    app.persist();
  }

  function pick(ref: string) {
    if (!ref) item.enchantment = undefined;
    else if (ref === 'custom') item.enchantment = { name: '' };
    else {
      const m = choices.find((x) => x.ref === ref)!;
      const fixed = magicLevel(m);
      item.enchantment = { ref, name: m.name, ...(fixed === undefined ? { rarity: RARITIES[magicLevels(m)[0] - 1] } : {}) };
    }
    save();
  }
</script>

{#if !e}
  <select class="pick" value="" onchange={(ev) => pick((ev.target as HTMLSelectElement).value)} aria-label="Enchantment">
    <option value="">No enchantment</option>
    {#each choices as m}<option value={m.ref}>{m.name}</option>{/each}
    <option value="custom">Something else…</option>
  </select>
{:else if !e.ref || !entry}
  <div class="row top">
    <input class="grow" bind:value={e.name} onchange={save} placeholder="Enchantment" aria-label="Enchantment" />
    <button class="ghost" aria-label="Remove enchantment" onclick={() => pick('')}>✕</button>
  </div>
  {#if e.ref}<p class="small muted note">Not in your equipment ({e.ref}).</p>{/if}
{:else}
  <div class="magic">
    <div class="row top">
      <strong class="grow">✦ {entry.name}</strong>
      <span class="small muted">{label(e.rarity ?? entry.rarity)}{entry.origins?.length ? ` · ${entry.origins.join(' or ')}` : ''}</span>
      <button class="ghost" aria-label="Remove enchantment" onclick={() => pick('')}>✕</button>
    </div>
    <p class="small muted note">p. {entry.page}. {entry.summary}</p>
    {#if effects.length}<p class="small note effects">{effects.join('. ')}.</p>{/if}
    <div class="fields">
      {#if levels.length > 1}
        <label>Rarity
          <select bind:value={e.rarity} onchange={save}>
            {#each levels as n}<option value={RARITIES[n - 1]}>{RARITY_NAMES[n - 1]}</option>{/each}
          </select>
        </label>
      {/if}
      {#if elemental}
        <label>Element
          <select bind:value={e.element} onchange={save}>
            <option value={undefined}>Choose…</option>
            {#each ELEMENTS as el}<option value={el}>{el[0].toUpperCase() + el.slice(1)}</option>{/each}
          </select>
        </label>
      {/if}
      <label>Charges <input type="number" inputmode="numeric" min="0" bind:value={e.charges} onchange={save} placeholder="—" /></label>
      {#if entry.origins?.includes('arcane')}
        <label>Quality
          <select bind:value={e.quality} onchange={save}>
            <option value={undefined}>Good</option><option value="fair">Fair</option><option value="poor">Poor</option>
          </select>
        </label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={e.cursed} onchange={save} /> Cursed</label>
    </div>
  </div>
{/if}

<style>
  .pick { width: 100%; }
  .top { flex-wrap: nowrap; align-items: baseline; }
  .grow { flex: 1; min-width: 0; }
  .magic { display: flex; flex-direction: column; gap: 0.3rem; border-top: 1px dashed var(--line, #d8c9a8); padding-top: 0.4rem; }
  .note { margin: 0; }
  .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr)); gap: 0.4rem; align-items: end; }
  .fields label { display: flex; flex-direction: column; font-size: 0.75rem; color: var(--muted); margin: 0; }
  .fields label.check { flex-direction: row; align-items: center; gap: 0.3rem; }
  .fields input, .fields select { min-width: 0; }
</style>
