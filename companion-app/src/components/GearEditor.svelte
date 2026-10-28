<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Character } from '../lib/character';
  import { armorStats, defense, grips, itemId, newArmor, newItem, newWeapon, weaponStats, type ArmorItem, type WeaponItem } from '../lib/gear';
  import { resolveItem, type EquipmentItem } from '../equipment/equipment';
  import type { ArmorType } from '../rules/rules';

  // The armor, weapons and other gear a character carries. Items from the equipment
  // file take their numbers from it; "Customize" turns one into a custom item whose
  // numbers can be edited. New items start from the ruleset's equipment file.
  let { character: c }: { character: Character } = $props();

  let inv = $derived(c.data.inventory);
  let file = $derived(c.rules.equipment);
  let fileArmor = $derived(file.items.filter((i) => i.kind === 'armor' && !i.barding));
  let fileWeapons = $derived(file.items.filter((i) => i.kind === 'weapon'));
  let fileGear = $derived(file.items.filter((i) => i.kind === 'gear' || i.kind === 'mount' || i.kind === 'service'));
  let addArmorType = $state('');
  let addWeaponType = $state('');
  let addItemRef = $state('');

  function save() {
    app.persist();
  }

  // An item whose reference this device can't find keeps its own numbers.
  const linked = (ref: string | undefined) => !!resolveItem(ref);
  const missing = (ref: string | undefined) => !!ref && !linked(ref);

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

  function addItem() {
    if (!addItemRef) return;
    const entry = resolveItem(addItemRef);
    inv.items.push(entry ? newItem(c.rules, entry.name) : { id: itemId(), name: 'New item', qty: 1 });
    addItemRef = '';
    save();
  }

  function setArmorRef(a: ArmorItem, ref: string) {
    const e = resolveItem(ref)!;
    if (a.name === resolveItem(a.ref)?.name) a.name = e.name;
    Object.assign(a, { ref }, armorStats(e));
    save();
  }

  function setWeaponRef(w: WeaponItem, ref: string) {
    const e = resolveItem(ref)!;
    if (w.name === w.type) w.name = e.name;
    Object.assign(w, { ref }, weaponStats(e));
    save();
  }

  function customize(g: ArmorItem | WeaponItem) {
    delete g.ref;
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

  function removeItem(id: string) {
    inv.items = inv.items.filter((i) => i.id !== id);
    save();
  }

  const held = (id: string) => (inv.wielded[0] === id ? 'main hand' : inv.wielded[1] === id ? 'off hand' : '');
  const hands = (w: WeaponItem) => (grips(w).length > 1 ? 'one or two hands' : grips(w)[0] === 'two' ? 'two hands' : 'one hand');
  const weaponLabel = (k: EquipmentItem) => `${k.name} (${k.shield ? 'shield' : `${k.size}${k.ranged ? ' ranged' : ''}`})`;
  const cost = (k: EquipmentItem) => (k.cost !== undefined ? ` · ${k.cost} ${file.data.currency ?? ''}`.trimEnd() : '');

  function weaponLine(w: WeaponItem): string {
    const parts: string[] = [w.shield ? 'shield' : `${w.size}${w.ranged ? ' ranged' : ''}`, hands(w)];
    if (w.reach) parts.push(`reach ${w.reach}`);
    if (w.range) parts.push(`${w.ranged ? 'range' : 'thrown'} ${w.range}`);
    parts.push(`enc. ${w.encumbrance}`);
    return parts.join(' · ');
  }
</script>

<h3>Armor <small class="muted">({file.name} p. {c.rules.gear.page})</small></h3>
{#each inv.armor as a (a.id)}
  <div class="item card">
    <div class="row top">
      <input class="name" bind:value={a.name} onchange={save} aria-label="Armor name" />
      {#if inv.worn === a.id}<span class="tag">worn</span>{/if}
      <button class="ghost" aria-label="Remove armor" onclick={() => removeArmor(a.id)}>✕</button>
    </div>
    {#if linked(a.ref)}
      <div class="fields">
        <label>Type
          <select value={a.ref} onchange={(e) => setArmorRef(a, (e.target as HTMLSelectElement).value)}>
            {#each fileArmor as k}<option value={file.ref(k)}>{k.name}</option>{/each}
          </select>
        </label>
        <label>Enc. <output>{a.encumbrance}</output></label>
        <label>Bonus <input type="number" inputmode="numeric" bind:value={a.bonus} onchange={save} /></label>
        <label>Defense <output>{defense(c.rules, a)}</output></label>
      </div>
      <button class="ghost small custom" onclick={() => customize(a)}>Customize</button>
    {:else}
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
      {#if missing(a.ref)}<p class="small muted note">Not in your equipment ({a.ref}); using the numbers saved with it.</p>{/if}
    {/if}
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
    {#if linked(w.ref)}
      <div class="fields">
        <label>Type
          <select value={w.ref} onchange={(e) => setWeaponRef(w, (e.target as HTMLSelectElement).value)}>
            {#each fileWeapons as k}<option value={file.ref(k)}>{k.name}</option>{/each}
          </select>
        </label>
        <label>Bonus <input type="number" inputmode="numeric" bind:value={w.bonus} onchange={save} /></label>
      </div>
      <p class="small muted props">{weaponLine(w)}{w.properties.length ? ` · ${w.properties.join(', ')}` : ''}</p>
      <button class="ghost small custom" onclick={() => customize(w)}>Customize</button>
    {:else}
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
        <span class="muted">{hands(w)}</span>
      </div>
      {#if w.properties.length}<p class="small muted props">{w.properties.join(', ')}</p>{/if}
      {#if missing(w.ref)}<p class="small muted note">Not in your equipment ({w.ref}); using the numbers saved with it.</p>{/if}
    {/if}
    <input bind:value={w.enchantment} onchange={save} placeholder="Enchantment" aria-label="Enchantment" />
  </div>
{/each}
<div class="row">
  <select bind:value={addWeaponType} onchange={addWeapon} aria-label="Add weapon">
    <option value="">+ Add weapon or shield…</option>
    {#each fileWeapons as k}<option value={k.name}>{weaponLabel(k)}</option>{/each}
    <option value="custom">Something else…</option>
  </select>
</div>

<h3>Other equipment</h3>
{#each inv.items as it (it.id)}
  <div class="line">
    <div class="row top">
      <input class="name" bind:value={it.name} onchange={save} aria-label="Item name" />
      <input class="qty" type="number" inputmode="numeric" min="1" bind:value={it.qty} onchange={() => { it.qty = Math.max(1, Math.round(it.qty || 1)); save(); }} aria-label="Quantity" />
      <button class="ghost" aria-label="Remove item" onclick={() => removeItem(it.id)}>✕</button>
    </div>
    {#if resolveItem(it.ref)?.summary}<p class="small muted props">{resolveItem(it.ref)?.summary}</p>{/if}
  </div>
{/each}
<div class="row">
  <select bind:value={addItemRef} onchange={addItem} aria-label="Add equipment">
    <option value="">+ Add equipment…</option>
    {#each fileGear as k}<option value={file.ref(k)}>{k.name}{k.stack ? ` (${k.stack})` : ''}{cost(k)}</option>{/each}
    <option value="custom">Something else…</option>
  </select>
</div>

<style>
  h3 { margin: 0.9rem 0 0.4rem; font-size: 1rem; }
  .item { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; padding: 0.6rem; }
  .top { flex-wrap: nowrap; }
  .name { flex: 1; min-width: 0; font-weight: 600; }
  .qty { width: 4rem; flex: none; }
  .line { margin-bottom: 0.4rem; }
  .tag { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); white-space: nowrap; }
  .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr)); gap: 0.4rem; }
  .fields label { display: flex; flex-direction: column; font-size: 0.75rem; color: var(--muted); margin: 0; }
  .fields input, .fields select { min-width: 0; }
  .fields output { font: 700 1.1rem Georgia, serif; color: var(--ink); padding: 0.3rem 0; }
  .checks { gap: 0.9rem; }
  .checks label { display: flex; align-items: center; gap: 0.3rem; margin: 0; }
  .props, .note { margin: 0; }
  .custom { align-self: flex-start; padding: 0.1rem 0; }
</style>
