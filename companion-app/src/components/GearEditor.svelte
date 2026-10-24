<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Character } from '../lib/character';
  import { defense, newArmor, newWeapon } from '../lib/gear';
  import type { ArmorType } from '../rules/rules';

  // The armor and weapons a character carries, each with the properties a player
  // would note on paper. New items start from the ruleset's equipment list.
  let { character: c }: { character: Character } = $props();

  let inv = $derived(c.data.inventory);
  let addArmorType = $state('');
  let addWeaponType = $state('');

  function save() {
    app.persist();
  }

  function addArmor() {
    if (!addArmorType) return;
    const item = newArmor(c.rules, addArmorType as ArmorType);
    inv.armor.push(item);
    if (!inv.worn) inv.worn = item.id;
    addArmorType = '';
    save();
  }

  function addWeapon() {
    if (!addWeaponType) return;
    inv.weapons.push(newWeapon(c.rules, addWeaponType === 'custom' ? 'Weapon' : addWeaponType));
    addWeaponType = '';
    save();
  }

  function removeArmor(id: string) {
    inv.armor = inv.armor.filter((a) => a.id !== id);
    if (inv.worn === id) inv.worn = '';
    save();
  }

  function removeWeapon(id: string) {
    inv.weapons = inv.weapons.filter((w) => w.id !== id);
    inv.wielded = [inv.wielded[0] === id ? '' : inv.wielded[0], inv.wielded[1] === id ? '' : inv.wielded[1]];
    save();
  }

  const held = (id: string) => (inv.wielded[0] === id ? 'main hand' : inv.wielded[1] === id ? 'off hand' : '');
</script>

<h3>Armor <small class="muted">({c.rules.name} p. {c.rules.gear.page})</small></h3>
{#each inv.armor as a (a.id)}
  <div class="item card">
    <div class="row top">
      <input class="name" bind:value={a.name} onchange={save} aria-label="Armor name" />
      {#if inv.worn === a.id}<span class="tag">worn</span>{/if}
      <button class="ghost" aria-label="Remove armor" onclick={() => removeArmor(a.id)}>✕</button>
    </div>
    <div class="fields">
      <label>Type
        <select bind:value={a.type} onchange={() => { a.encumbrance = c.rules.armorKind(a.type).encumbrance; save(); }}>
          {#each c.rules.gear.armor as k}<option value={k.type}>{k.type}</option>{/each}
        </select>
      </label>
      <label>Enc. <input type="number" inputmode="numeric" bind:value={a.encumbrance} onchange={save} /></label>
      <label>Bonus <input type="number" inputmode="numeric" bind:value={a.bonus} onchange={save} /></label>
      <label>Defense <output>{defense(c.rules, a)}</output></label>
    </div>
    <input bind:value={a.enchantment} onchange={save} placeholder="Enchantment" aria-label="Enchantment" />
  </div>
{/each}
<div class="row">
  <select bind:value={addArmorType} onchange={addArmor} aria-label="Add armor">
    <option value="">+ Add armor…</option>
    {#each c.rules.gear.armor as k}<option value={k.type}>{k.type} armor (defense {k.defense})</option>{/each}
  </select>
</div>

<h3>Weapons and shields</h3>
{#each inv.weapons as w (w.id)}
  <div class="item card">
    <div class="row top">
      <input class="name" bind:value={w.name} onchange={save} aria-label="Weapon name" />
      {#if held(w.id)}<span class="tag">{held(w.id)}</span>{/if}
      <button class="ghost" aria-label="Remove weapon" onclick={() => removeWeapon(w.id)}>✕</button>
    </div>
    <div class="fields">
      <label>Type <input bind:value={w.type} onchange={save} /></label>
      <label>Size
        <select bind:value={w.size} onchange={save}>
          <option value="light">light</option><option value="medium">medium</option><option value="heavy">heavy</option>
        </select>
      </label>
      <label>Enc. <input type="number" inputmode="numeric" bind:value={w.encumbrance} onchange={save} /></label>
      <label>Bonus <input type="number" inputmode="numeric" bind:value={w.bonus} onchange={save} /></label>
      {#if w.ranged}
        <label>Range <input type="number" inputmode="numeric" bind:value={w.range} onchange={save} /></label>
      {:else if !w.shield}
        <label>Reach <input type="number" inputmode="numeric" bind:value={w.reach} onchange={save} /></label>
        <label>Thrown <input type="number" inputmode="numeric" bind:value={w.range} onchange={save} /></label>
      {/if}
    </div>
    <div class="row checks small">
      <label><input type="checkbox" bind:checked={w.ranged} onchange={save} /> Ranged</label>
      <label><input type="checkbox" bind:checked={w.shield} onchange={save} /> Shield</label>
      <span class="muted">{w.shield || w.size === 'light' ? 'one hand' : w.size === 'heavy' ? 'two hands' : 'one or two hands'}</span>
    </div>
    {#if w.properties.length}<p class="small muted props">{w.properties.join(', ')}</p>{/if}
    <input bind:value={w.enchantment} onchange={save} placeholder="Enchantment" aria-label="Enchantment" />
  </div>
{/each}
<div class="row">
  <select bind:value={addWeaponType} onchange={addWeapon} aria-label="Add weapon">
    <option value="">+ Add weapon or shield…</option>
    {#each c.rules.gear.weapons as k}<option value={k.type}>{k.type} ({k.shield ? 'shield' : `${k.size}${k.ranged ? ' ranged' : ''}`})</option>{/each}
    <option value="custom">Something else…</option>
  </select>
</div>

<style>
  h3 { margin: 0.9rem 0 0.4rem; font-size: 1rem; }
  .item { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; padding: 0.6rem; }
  .top { flex-wrap: nowrap; }
  .name { flex: 1; min-width: 0; font-weight: 600; }
  .tag { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); white-space: nowrap; }
  .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr)); gap: 0.4rem; }
  .fields label { display: flex; flex-direction: column; font-size: 0.75rem; color: var(--muted); margin: 0; }
  .fields input, .fields select { min-width: 0; }
  .fields output { font: 700 1.1rem Georgia, serif; color: var(--ink); padding: 0.3rem 0; }
  .checks { gap: 0.9rem; }
  .checks label { display: flex; align-items: center; gap: 0.3rem; margin: 0; }
  .props { margin: 0; }
</style>
