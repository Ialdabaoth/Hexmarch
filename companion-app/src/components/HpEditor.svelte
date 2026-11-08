<script lang="ts">
  import { app } from '../lib/app.svelte';
  import type { Character } from '../lib/character';

  let { character: c, onclose }: { character: Character; onclose: () => void } = $props();

  // Current HP is max HP minus damage taken (plus any temporary HP effects),
  // so every change here is a change to the damage on the live state.
  function change(delta: number) {
    c.state.damage = Math.max(0, Math.min(2 * c.sheet.hp(), c.state.damage - delta));
    app.persist();
  }

  function setTo(value: number) {
    if (Number.isFinite(value)) change(Math.round(value) - c.hp);
  }

  let input = $state<HTMLInputElement>();
  $effect(() => input?.select());
</script>

<div class="scrim no-print" role="presentation" onclick={onclose}>
  <div class="box card" role="dialog" aria-modal="true" aria-label="Edit hit points" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
    <div class="small muted">{c.name} · hit points</div>
    <div class="now">
      <input bind:this={input} type="number" inputmode="numeric" value={c.hp} aria-label="Current HP"
        onchange={(e) => setTo(+(e.target as HTMLInputElement).value)} />
      <span class="muted">/ {c.hpMax}</span>
    </div>
    <div class="steps">
      <button onclick={() => change(-5)}>−5</button>
      <button onclick={() => change(-1)}>−1</button>
      <button onclick={() => change(1)}>+1</button>
      <button onclick={() => change(5)}>+5</button>
    </div>
    <div class="row">
      <button class="grow" onclick={() => setTo(c.hpMax)} disabled={c.state.damage === 0}>Full heal</button>
      <button class="primary grow" onclick={onclose}>Done</button>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / 0.35); display: grid; place-items: center; padding: 16px; }
  .box { width: min(340px, 100%); display: flex; flex-direction: column; gap: 0.75rem; }
  .now { display: flex; align-items: baseline; justify-content: center; gap: 0.4rem; font: 700 2.4rem Georgia, serif; }
  .now input { width: 4.5ch; font: inherit; text-align: center; padding: 0.1rem 0.25rem; }
  .now span { font-size: 1.6rem; }
  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
  .steps button { font-size: 1.1rem; font-weight: 600; min-height: 48px; }
</style>
