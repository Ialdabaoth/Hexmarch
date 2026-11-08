<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { expressionRoll, thresholdCheck } from '../lib/checks';
  import type { Difficulty } from '../rules/rules';
  import { holdRoll } from '../lib/hold.svelte';
  import RollLog from './RollLog.svelte';

  // The dice tray behind the floating dice button: quick rolls, threshold checks and
  // this device's roll history, open from any screen.
  let { onclose }: { onclose: () => void } = $props();

  let expression = $state('');
  let who = $state('');
  let label = $state('');
  let target = $state(14);

  // The game only rolls d6 and d20; the box below still takes any expression.
  const quick = ['d6', '2d6', '3d6', 'd20', '2d20', '4d6'];

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

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim no-print" onclick={onclose}>
  <div class="tray card" role="dialog" aria-modal="true" aria-label="Dice" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
    <div class="row head">
      <h2 class="grow">Dice</h2>
      <button class="ghost" onclick={onclose} aria-label="Close dice">✕</button>
    </div>

    <div class="quick">
      {#each quick as q}<button onclick={() => rollIt(q)}>{q}</button>{/each}
    </div>

    <form class="row" onsubmit={(e) => { e.preventDefault(); if (expression.trim()) rollIt(expression.trim()); }}>
      <input class="grow" bind:value={expression} placeholder="e.g. 2d6+1, 4d6kh3" aria-label="Dice expression" autocapitalize="off" autocomplete="off" />
      <button class="primary" type="submit">Roll</button>
    </form>

    <div class="row vs">
      <label for="target" style="margin:0">Need</label>
      <input id="target" type="number" min="1" max="20" bind:value={target} style="width:4.5rem" />
      <button use:holdRoll={(d) => vs(20, d)}>d20</button>
      <button use:holdRoll={(d) => vs(6, d)}>d6</button>
    </div>
    <p class="small muted" style="margin:0.25rem 0 0">Hold a die and slide up for Easy or down for Hard.</p>

    <details style="margin-top:0.5rem">
      <summary class="small muted">Label rolls (for Discord)</summary>
      <div class="grid2">
        <div><label for="who">Who</label><input id="who" bind:value={who} placeholder="Referee" /></div>
        <div><label for="label">What</label><input id="label" bind:value={label} placeholder="Wandering monster" /></div>
      </div>
    </details>

    <h3 style="margin:1rem 0 0.4rem">History</h3>
    <RollLog />
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 15; background: rgb(0 0 0 / 0.35); display: flex; align-items: flex-end; justify-content: center; }
  .tray {
    width: 100%;
    max-width: 640px;
    max-height: calc(100% - 3rem - env(safe-area-inset-top));
    overflow-y: auto;
    box-sizing: border-box;
    border-radius: 16px 16px 0 0;
    padding-bottom: calc(70px + env(safe-area-inset-bottom));
  }
  .head { align-items: center; flex-wrap: nowrap; }
  .head h2 { margin: 0; }
  .quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0.5rem 0 0.75rem; }
  .quick button { font-size: 1.1rem; font-weight: 600; min-height: 48px; }
  .vs { margin-top: 0.75rem; }
</style>
