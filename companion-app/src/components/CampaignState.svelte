<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { clockLabel, rulesLabel } from '../lib/state';
  import { downloadJson } from '../lib/storage';

  // The campaign state file: its parties (Heph 2026-11-10: each with its own start, clock, session and place on the
  // map; the referee makes them in the Atlas), what everyone knows, and who is in which party.
  // It lives on this device for now; Scribe publishes it inside the snapshot players read.
  // A player (player mode) reads it and can load the file the referee shares, but changes nothing.
  let { readonly = false }: { readonly?: boolean } = $props();
  let s = $derived(app.state);
  let p = $derived(app.currentParty);
  let found = $derived(Object.values(s.revealed).reduce((n, r) => n + r.hexes.length + r.places.length, 0));
  let start = $state('');
  const DATE = /^\d{1,5}-\d\d-\d\d$/;
  let fileInput = $state<HTMLInputElement>();

  async function save() {
    downloadJson('state.json', await app.exportState());
  }

  async function load(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await app.importState(JSON.parse(await file.text()));
      app.notify('Campaign state loaded');
    } catch (e) {
      app.notify(e instanceof SyntaxError ? "That file isn't JSON" : (e as Error).message);
    }
  }

  async function setStart() {
    await app.setStartDate(start);
    start = '';
  }
</script>

<dl class="facts">
  <dt>Party</dt>
  <dd>
    {#if !readonly && s.parties.length > 1}
      <select value={s.active} onchange={(e) => app.chooseParty((e.target as HTMLSelectElement).value)} aria-label="Party in use">
        {#each s.parties as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
      </select>
    {:else if p}
      {p.name}
    {:else}
      {readonly ? 'not in a party yet' : 'none yet (make one in the Atlas: Maps › Party › New party)'}
    {/if}
  </dd>
  {#if p}
  <dt>Clock</dt>
  <dd>
    {clockLabel(p.clock)}
    {#if !readonly}<span class="row">
      <button class="small" onclick={() => app.passTime(1)}>+1 hour</button>
      <button class="small" onclick={() => app.passTime(8)}>+8 hours</button>
      <button class="small" onclick={() => app.passTime(24)}>+1 day</button>
    </span>{/if}
  </dd>
  <dt>Where</dt>
  <dd>{p.at ? `hex ${p.at.label} · ${p.at.module}` : readonly ? 'not on a map yet' : 'not on a map yet (place them with the Atlas’s Party button below)'}</dd>
  <dt>Session</dt>
  <dd>
    {p.session.number ? `Session ${p.session.number}, ${p.session.open ? 'in play' : 'closed'}` : 'None played yet'}
    {#if !readonly && p.session.open}
      <button class="small" onclick={() => app.closeSession()}>End session</button>
    {:else if !readonly}
      <button class="small" onclick={() => app.openSession()}>Start session {p.session.number + 1}</button>
    {/if}
  </dd>
  {/if}
  <dt>Rules</dt>
  <dd>{rulesLabel(s.rules)}</dd>
  <dt>Found</dt>
  <dd>{found ? `${found} hex${found === 1 ? '' : 'es'} and places` : 'Nothing yet'}</dd>
</dl>

{#if !readonly && p}
<details>
  <summary class="small">Start date</summary>
  <div class="row">
    <input type="text" placeholder={p.clock.start} bind:value={start} aria-label="Start date (YYYY-MM-DD)" />
    <button class="small" onclick={setStart} disabled={!DATE.test(start)}>Set</button>
  </div>
  <p class="small muted">Year, month and day in the setting's own years (Materia Mundi: AD + 2085, so 1422 is 3507).</p>
</details>

{/if}

<div class="row" style="margin-top:0.5rem">
  {#if !readonly}<button onclick={save}>Save state file</button>{/if}
  <button onclick={() => fileInput?.click()}>Load state file</button>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={load} />
</div>
<p class="small muted">
  Change {s.revision}. This is the campaign's shared record; players get it each time Scribe publishes the campaign.
</p>

<style>
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 0.75rem; margin: 0.25rem 0; }
  .facts dt { font-weight: 600; }
  .facts dd { margin: 0; }
  .facts .row { display: inline-flex; gap: 0.3rem; margin-left: 0.3rem; }
  button.small { min-height: 0; padding: 0.15rem 0.5rem; }
</style>
