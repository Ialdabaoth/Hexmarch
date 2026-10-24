<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { effectTargetName, type Character, type EffectTarget } from '../lib/character';
  import { ABILITIES, TALENTS } from '../rules/rules';

  let { character: c }: { character: Character } = $props();

  let label = $state('');
  let target = $state<EffectTarget>('str');
  let amount = $state(1);

  function add() {
    c.state.effects.push({ label: label.trim() || 'Effect', target, amount });
    label = '';
    app.persist();
  }

  function remove(i: number) {
    c.state.effects.splice(i, 1);
    app.persist();
  }
</script>

<h2>Effects</h2>
<p class="small muted">Temporary boosts and debuffs. They change the live numbers above, never the sheet.</p>
{#each c.state.effects as e, i}
  <div class="row effect">
    <span class="grow"><strong>{e.amount > 0 ? '+' : ''}{e.amount} {effectTargetName(e.target)}</strong> <span class="muted">{e.label}</span></span>
    <button class="ghost" aria-label="End effect" onclick={() => remove(i)}>✕</button>
  </div>
{/each}
<div class="add">
  <input bind:value={label} placeholder="What (e.g. Potion of Might)" aria-label="Effect name" />
  <select bind:value={target} aria-label="What it changes">
    <optgroup label="Abilities">{#each ABILITIES as a}<option value={a.id}>{a.short}</option>{/each}</optgroup>
    <optgroup label="Talents">{#each TALENTS as t}<option value={t.id}>{t.name}</option>{/each}</optgroup>
    <option value="hp">Temporary HP</option>
  </select>
  <input type="number" bind:value={amount} aria-label="Amount" />
  <button onclick={add}>Add</button>
</div>

<style>
  .effect { border-bottom: 1px solid var(--line); }
  .effect button { min-height: 36px; }
  .add { display: grid; grid-template-columns: 1fr 1fr 4rem auto; gap: 0.3rem; margin-top: 0.4rem; }
  .add input:first-child { grid-column: 1 / -1; }
  .add input, .add select { min-width: 0; }
</style>
