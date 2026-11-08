<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { DEFAULT_RULES, findRules, rulesFor } from '../rules/rules';
  import Classes from './Classes.svelte';
  import Bestiary from './Bestiary.svelte';
  import Panoply from './Panoply.svelte';

  // What the game is made of: classes, monsters, gear and magic, and the procedures
  // the Campaign tab runs, for the rules chosen in Settings.
  let rules = $derived(findRules(app.settings.rules) ?? rulesFor(DEFAULT_RULES));
</script>

<h1>Rules</h1>

<p class="small muted" style="margin-top:-0.5rem">
  {rules.name} ·
  <button class="link" onclick={() => (app.view = { name: 'settings' })}>Change rules</button>
</p>

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

<style>
  .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); text-decoration: underline; font: inherit; }
</style>
