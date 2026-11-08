<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Character } from '../lib/character';
  import { WORN_SLOTS, magicFormOf, slotsFor, type WornSlot } from '../lib/gear';

  // Choose which carried magic item is worn in a slot. Only items of the matching form
  // are offered; an item worn in another slot moves here.
  let { character: c, slot, onclose }: { character: Character; slot: WornSlot; onclose: () => void } = $props();

  let inv = $derived(c.data.inventory);
  let info = $derived(WORN_SLOTS.find((s) => s.id === slot)!);
  let current = $derived(inv.equipped?.[slot]);
  let candidates = $derived(inv.items.filter((i) => slotsFor(magicFormOf(i)).includes(slot)));

  function wornElsewhere(id: string): string | undefined {
    const other = WORN_SLOTS.find((s) => s.id !== slot && inv.equipped?.[s.id] === id);
    return other?.label;
  }

  function choose(id = '') {
    const next = { ...(inv.equipped ?? {}) };
    // One item sits in one slot, so an item moving here leaves its old slot.
    if (id) for (const s of WORN_SLOTS) if (next[s.id] === id) delete next[s.id];
    if (id) next[slot] = id;
    else delete next[slot];
    inv.equipped = next;
    app.persist();
    onclose();
  }
</script>

<div class="scrim no-print" role="presentation" onclick={onclose}>
  <div class="box card" role="dialog" aria-modal="true" aria-label={info.label} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
    <div class="small muted">{c.name} · {info.label.toLowerCase()}</div>
    <div class="list">
      {#each candidates as item (item.id)}
        {@const elsewhere = wornElsewhere(item.id)}
        <button class="choice" class:on={item.id === current} onclick={() => choose(item.id)}>
          <span>{item.name}</span><small>{elsewhere ? `worn as ${elsewhere}` : item.enchantment?.name ?? ''}</small>
        </button>
      {/each}
      <button class="choice" class:on={!current} onclick={() => choose()}>
        <span>Nothing</span>
      </button>
    </div>
    {#if !candidates.length}<p class="small muted">No {info.form === 'ring' ? 'rings' : info.form + 's'} in the inventory yet.</p>{/if}
    <div class="row">
      <button class="ghost" onclick={onclose}>Close</button>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / 0.35); display: grid; place-items: center; padding: 16px; }
  .box { width: min(420px, 100%); max-height: 80vh; overflow: auto; }
  .list { display: grid; gap: 0.4rem; margin: 0.5rem 0; }
  .choice { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; text-align: left; min-height: 48px; }
  .choice.on { border-color: var(--accent); }
</style>
