<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { clockLabel, rulesLabel } from '../lib/state';
  import { downloadJson } from '../lib/storage';

  // The campaign state file: where the party stands, the clock, what's been found and the session.
  // It lives on this device for now; with sign-in, Update campaign commits it as campaign/state.json.
  let s = $derived(app.state);
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
  <dt>Clock</dt>
  <dd>
    {clockLabel(s)}
    <span class="row">
      <button class="small" onclick={() => app.passTime(1)}>+1 hour</button>
      <button class="small" onclick={() => app.passTime(8)}>+8 hours</button>
      <button class="small" onclick={() => app.passTime(24)}>+1 day</button>
    </span>
  </dd>
  <dt>Party</dt>
  <dd>{s.party ? `hex ${s.party.label} · ${s.party.module}` : 'not on a map yet (place them with the Atlas’s Party button below)'}</dd>
  <dt>Session</dt>
  <dd>
    {s.session.number ? `Session ${s.session.number}, ${s.session.open ? 'in play' : 'closed'}` : 'None played yet'}
    {#if s.session.open}
      <button class="small" onclick={() => app.closeSession()}>End session</button>
    {:else}
      <button class="small" onclick={() => app.openSession()}>Start session {s.session.number + 1}</button>
    {/if}
  </dd>
  <dt>Rules</dt>
  <dd>{rulesLabel(s.rules)}</dd>
  <dt>Found</dt>
  <dd>{found ? `${found} hex${found === 1 ? '' : 'es'} and places` : 'Nothing yet'}</dd>
</dl>

<details>
  <summary class="small">Start date</summary>
  <div class="row">
    <input type="text" placeholder={s.clock.start} bind:value={start} aria-label="Start date (YYYY-MM-DD)" />
    <button class="small" onclick={setStart} disabled={!DATE.test(start)}>Set</button>
  </div>
  <p class="small muted">Year, month and day in the setting's own years (Materia Mundi: AD + 2085, so 1422 is 3507).</p>
</details>

<div class="row" style="margin-top:0.5rem">
  <button onclick={save}>Save state file</button>
  <button onclick={() => fileInput?.click()}>Load state file</button>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={load} />
</div>
<p class="small muted">
  Change {s.revision}. This is the campaign's shared record; it stays on this device until sign-in, when Update campaign
  saves it to the campaign's repository for the players to read.
</p>

<style>
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 0.75rem; margin: 0.25rem 0; }
  .facts dt { font-weight: 600; }
  .facts dd { margin: 0; }
  .facts .row { display: inline-flex; gap: 0.3rem; margin-left: 0.3rem; }
  button.small { min-height: 0; padding: 0.15rem 0.5rem; }
</style>
