<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { expressionRoll, thresholdCheck } from '../lib/checks';
  import type { Difficulty } from '../rules/rules';
  import { holdRoll } from '../lib/hold.svelte';
  import RollLog from './RollLog.svelte';
  import Bestiary from './Bestiary.svelte';

  let expression = $state('');
  let who = $state('');
  let label = $state('');
  let target = $state(14);

  const quick = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', '2d6', '3d6', 'd100'];

  async function rollIt(expr: string) {
    try {
      await app.record(expressionRoll({ who: who.trim() || 'Dice', label: label.trim() || expr, expression: expr }));
    } catch (e) {
      app.notify((e as Error).message);
    }
  }

  async function vs(sides: 6 | 20, difficulty: Difficulty) {
    await app.record(
      thresholdCheck({ who: who.trim() || 'Dice', label: label.trim() || `d${sides} check`, sides, threshold: target, difficulty })
    );
  }

</script>

<h1>Referee</h1>

<h2 style="margin:0 0 0.5rem">Dice</h2>

<div class="quick">
  {#each quick as q}<button onclick={() => rollIt(q)}>{q}</button>{/each}
</div>

<form class="row" onsubmit={(e) => { e.preventDefault(); if (expression.trim()) rollIt(expression.trim()); }}>
  <input class="grow" bind:value={expression} placeholder="e.g. 2d6+1, 4d6kh3" aria-label="Dice expression" autocapitalize="off" autocomplete="off" />
  <button class="primary" type="submit">Roll</button>
</form>

<section class="card" style="margin-top:0.75rem">
  <h3>Roll against a threshold</h3>
  <p class="small muted">Hold a die and slide up for Easy or down for Hard.</p>
  <div class="row">
    <label for="target" style="margin:0">Need</label>
    <input id="target" type="number" min="1" max="20" bind:value={target} style="width:5rem" />
    <button use:holdRoll={(d) => vs(20, d)}>d20</button>
    <button use:holdRoll={(d) => vs(6, d)}>d6</button>
  </div>
</section>

<details style="margin-top:0.75rem">
  <summary class="small muted">Label rolls (for Discord)</summary>
  <div class="grid2">
    <div><label for="who">Who</label><input id="who" bind:value={who} placeholder="Referee" /></div>
    <div><label for="label">What</label><input id="label" bind:value={label} placeholder="Wandering monster" /></div>
  </div>
</details>

<section style="margin-top:1rem">
  <Bestiary />
</section>

<h2 style="margin:1rem 0 0">History</h2>
<RollLog />

<style>
  .quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.75rem; }
  .quick button { font-size: 1.1rem; font-weight: 600; min-height: 52px; }
</style>
