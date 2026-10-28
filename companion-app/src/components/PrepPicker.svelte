<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { equipment, type Character } from '../lib/character';
  import { armorEffect, byCircle, checkPreparations } from '../lib/magic';

  // Fill an empty preparation slot from the book: anything of the slot's circle or lower.
  let { character: c, circle, onclose }: { character: Character; circle: number; onclose: () => void } = $props();

  let magic = $derived(c.rules.getClass(c.classId).magic!);
  let gear = $derived(equipment(c));
  let armor = $derived(armorEffect(magic.armor, gear.worn?.type, !!(gear.main?.shield || gear.off?.shield)));
  let label = $derived(magic.circleWord === 'Rarity' ? (['Common', 'Uncommon', 'Rare', 'Legendary'][circle - 1] ?? `Rarity ${circle}`) : `${circle}${['st', 'nd', 'rd'][circle - 1] ?? 'th'} circle`);

  function fits(n: number) {
    return checkPreparations(magic.slots, c.level, [...c.data.inventory.prepared, { circle: n }], armor.penalty).over.length === 0;
  }
  let choices = $derived(byCircle(c.data.inventory.book).map(({ entry: b, i }) => ({ ...b, i, ok: b.circle <= circle && fits(b.circle) })));

  function choose(entry: { ref?: string; magic: string; circle: number }) {
    c.data.inventory.prepared.push({ ...(entry.ref ? { ref: entry.ref } : {}), magic: entry.magic, circle: entry.circle, spent: false });
    app.persist();
    app.notify(`Prepared: ${entry.magic || magic.prepared.toLowerCase()}`);
    onclose();
  }

  function openMagic() {
    onclose();
    app.view = { name: 'sheet', id: c.id, section: 'magic' };
  }
</script>

<div class="scrim no-print" role="presentation" onclick={onclose}>
  <div class="box card" role="dialog" aria-modal="true" aria-label="Prepare" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
    <div class="small muted">{c.name} · {label} {magic.prepared.toLowerCase()}</div>
    <div class="list">
      {#each choices as b (b.i)}
        <button class="choice" disabled={!b.ok} onclick={() => choose(b)}>
          <span>{b.magic || 'Unnamed'}</span><small>{magic.circleWord === 'Rarity' ? 'CURL'[b.circle - 1] : `${b.circle}${['st', 'nd', 'rd'][b.circle - 1] ?? 'th'}`}</small>
        </button>
      {/each}
    </div>
    {#if !choices.length}<p class="small muted">Your {magic.book.toLowerCase()} is empty.</p>{/if}
    <div class="row">
      <button class="ghost grow" onclick={openMagic}>Edit {magic.book.toLowerCase()}</button>
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
  .choice:disabled { opacity: 0.45; }
</style>
