<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Character } from '../lib/character';
  import { defense, fitsMainHand, fitsOffHand, needsBothHands, type WeaponItem } from '../lib/gear';

  // Choose what to wear, or what goes in each hand, from what the character carries.
  let { character: c, slot, onclose }: { character: Character; slot: 'armor' | 'main' | 'off'; onclose: () => void } = $props();

  let inv = $derived(c.data.inventory);
  let main = $derived(inv.weapons.find((w) => w.id === inv.wielded[0]));
  let title = $derived({ armor: 'Wear armor', main: 'Main hand', off: 'Off hand' }[slot]);
  let current = $derived(slot === 'armor' ? inv.worn : slot === 'main' ? inv.wielded[0] : inv.wielded[1]);

  let choices = $derived(
    slot === 'armor'
      ? inv.armor.map((a) => ({ id: a.id, name: a.name, detail: `${a.type}, defense ${defense(c.rules, a)}`, ok: true }))
      : inv.weapons.map((w) => ({
          id: w.id,
          name: w.name,
          detail: describe(w),
          ok: slot === 'main' ? fitsMainHand(w) : fitsOffHand(c.rules, main, w)
        }))
  );

  function describe(w: WeaponItem) {
    if (w.shield) return 'shield';
    const parts: string[] = [w.size, w.ranged ? 'ranged' : 'melee'];
    if (needsBothHands(c.rules, w)) parts.push('two hands');
    if (w.bonus) parts.push(`+${w.bonus}`);
    return parts.join(', ');
  }

  function choose(id: string) {
    if (slot === 'armor') {
      inv.worn = id;
    } else if (slot === 'main') {
      const next = inv.weapons.find((w) => w.id === id);
      const off = inv.weapons.find((w) => w.id === inv.wielded[1]);
      // A two-handed weapon empties the off hand; so does moving the off-hand weapon over.
      const keepOff = off && off.id !== id && fitsOffHand(c.rules, next, off);
      inv.wielded = [id, keepOff ? off.id : ''];
    } else {
      inv.wielded = [inv.wielded[0], id];
    }
    app.persist();
    onclose();
  }

  function editGear() {
    onclose();
    app.view = { name: 'sheet', id: c.id };
  }
</script>

<div class="scrim no-print" role="presentation" onclick={onclose}>
  <div class="box card" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
    <div class="small muted">{c.name} · {title.toLowerCase()}</div>
    <div class="list">
      {#each choices as g}
        <button class="choice" class:on={g.id === current} disabled={!g.ok} onclick={() => choose(g.id)}>
          <span>{g.name}</span><small>{g.ok ? g.detail : slot === 'off' ? 'needs a free hand' : 'off hand only'}</small>
        </button>
      {/each}
      <button class="choice" class:on={!current} onclick={() => choose('')}>
        <span>{slot === 'armor' ? 'No armor' : 'Empty hand'}</span>
      </button>
    </div>
    {#if !choices.length}<p class="small muted">Nothing to {slot === 'armor' ? 'wear' : 'wield'} yet.</p>{/if}
    <div class="row">
      <button class="ghost grow" onclick={editGear}>Add or edit gear</button>
      <button class="primary grow" onclick={onclose}>Done</button>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / 0.35); display: grid; place-items: center; padding: 16px; }
  .box { width: min(360px, 100%); max-height: 85vh; overflow: auto; display: flex; flex-direction: column; gap: 0.75rem; }
  .list { display: flex; flex-direction: column; gap: 0.4rem; }
  .choice { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; text-align: left; min-height: 48px; }
  .choice small { color: var(--muted); }
  .choice.on { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); font-weight: 600; }
  .choice:disabled { opacity: 0.45; }
</style>
