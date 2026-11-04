<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { RULESETS, rulesFor } from '../rules/rules';
  import Classes from './Classes.svelte';
  import Bestiary from './Bestiary.svelte';
  import Panoply from './Panoply.svelte';

  // What the game is made of: classes, monsters, gear and magic, and the procedures
  // the Campaign tab runs. Starts on the rules of the character in front.
  const active = app.characters.find((c) => c.id === app.settings.activeId) ?? app.characters[0];
  let rulesId = $state(active?.rules.id ?? RULESETS[0].id);
  let rules = $derived(rulesFor(rulesId));
</script>

<h1>Rules</h1>

<section class="card">
  <label for="rules" style="margin-top:0">Rules</label>
  <select id="rules" bind:value={rulesId}>
    {#each RULESETS as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
  </select>
</section>

<Classes {rules} />
<Bestiary />
<Panoply {rules} />
<details class="section">
  <summary><h2>Procedures</h2></summary>
  <p class="small muted">
    Procedures are the referee's step-by-step routines: who rolls, what they roll, and what happens next, with d6 and d20
    tables that can call one another. Defined here, run from the Campaign tab. None defined yet.
  </p>
</details>
