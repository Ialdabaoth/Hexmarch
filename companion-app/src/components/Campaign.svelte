<script lang="ts">
  import { app } from '../lib/app.svelte';
  import Maps from './Maps.svelte';
  import ModuleMaps from './ModuleMaps.svelte';
  import Modules from './Modules.svelte';
  import Art from './Art.svelte';
  import Creatures from './Creatures.svelte';
  import CampaignState from './CampaignState.svelte';
  import { knownCreatures } from '../lib/invitations';

  // The game being played (the campaign itself is chosen in Settings): its parties, maps, events, history and
  // procedures, and who is in it. Shared campaigns arrive with sign-in; for now
  // everything lives on this device.
  function className(c: (typeof app.characters)[number]): string {
    try {
      return c.rules.getClass(c.classId).name;
    } catch {
      return c.classId;
    }
  }

  // Player mode: your party as the referee's state file lists it, and the NPCs your character has heard of or met.
  let player = $derived(app.mode === 'player');
  let me = $derived(app.me);
  let partyNames = $derived(app.state.characters.filter((c) => c.id !== me?.id));
  let known = $derived(me ? knownCreatures(me.data.knowledge) : []);

  function open(id: string) {
    app.updateSettings({ activeId: id });
    app.view = { name: 'list' };
  }
</script>

<h1>Campaign</h1>

<p class="small muted" style="margin-top:-0.5rem">
  {app.campaign ? app.campaign.campaign.name : 'This device'} ·
  <button class="link" onclick={() => (app.view = { name: 'settings' })}>Change campaign</button>
</p>

<details class="section" open>
  <summary><h2>{player ? 'Your party' : 'Parties'}</h2></summary>
  {#if player}
    {#if me}
      <ul class="tree">
        <li>
          <button class="link" onclick={() => open(me.id)}>{me.name}</button> <span class="small muted">{className(me)} {me.level} · you</span>
          {#if me.data.followers.length}
            <ul>
              {#each me.data.followers as f (f.id)}<li class="small">{f.name} <span class="muted">· {f.kind === 'beast' ? 'beast' : 'follower'}, level {f.level}</span></li>{/each}
            </ul>
          {/if}
        </li>
        {#each partyNames as c (c.id)}<li>{c.name}</li>{/each}
      </ul>
      {#if !partyNames.length}<p class="small muted">The rest of your party shows here once the referee shares the campaign state.</p>{/if}
      <h3>People you know of</h3>
      {#if known.length}
        <ul class="tree">
          {#each known as k (k.id)}<li>{k.name} <span class="small muted">· {k.met ? 'met' : 'heard of'}{k.how ? `, ${k.how}` : ''}</span></li>{/each}
        </ul>
      {:else}
        <p class="small muted">No one yet. NPCs {me.name} meets or hears of are listed here.</p>
      {/if}
    {:else}
      <p class="small muted">Pick or make your character in the Party tab.</p>
    {/if}
  {:else if app.party.length}
    <ul class="tree">
      <li>
        <strong>{app.currentParty?.name ?? 'Party'}</strong> <span class="small muted">· active{app.currentParty?.at ? ` · hex ${app.currentParty.at.label}` : ''}</span>
        <ul>
          {#each app.party as c (c.id)}
            <li>
              <button class="link" onclick={() => open(c.id)}>{c.name}</button>
              <span class="small muted">{className(c)} {c.level}</span>
              {#if app.state.parties.length > 1}
                <select class="small" value={app.state.characters.find((x) => x.id === c.id)?.party ?? app.state.active}
                  onchange={(e) => app.moveToParty(c.id, (e.target as HTMLSelectElement).value)} aria-label="Move {c.name} to another party">
                  {#each app.state.parties as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
                </select>
              {/if}
              {#if c.data.followers.length}
                <ul>
                  {#each c.data.followers as f (f.id)}
                    <li class="small">{f.name} <span class="muted">· {f.kind === 'beast' ? 'beast' : 'follower'}, level {f.level}</span></li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </li>
    </ul>
  {:else}
    <p class="small muted">No characters yet. Roll one up in the Party tab.</p>
  {/if}
</details>

<details class="section" open>
  <summary><h2>State</h2></summary>
  <CampaignState readonly={player} />
</details>

{#if !player}
  <details class="section" open>
    <summary><h2>Creatures</h2></summary>
    <Creatures />
  </details>
{/if}

<details class="section" open>
  <summary><h2>Maps</h2></summary>
  <ModuleMaps />
  {#if !player}<Maps />{/if}
</details>

<details class="section">
  <summary><h2>Procedures</h2></summary>
  <p class="small muted">Buttons for travel, wandering monsters, weather and the like will run here, step by step, using the tables defined in the Rules tab.</p>
</details>

<details class="section">
  <summary><h2>Events</h2></summary>
  <p class="small muted">What happened this session: encounters, discoveries, loot. Nothing logged yet.</p>
</details>

<details class="section">
  <summary><h2>History</h2></summary>
  <p class="small muted">The campaign's chronicle, one entry per session, with the option to undo back to any of them. Nothing recorded yet.</p>
</details>

{#if !player}
<details class="section">
  <summary><h2>Art</h2></summary>
  <Art />
</details>

<details class="section">
  <summary><h2>Manage</h2></summary>
  <section class="card">
    <h3>Members</h3>
    <p class="small muted">Just you, on this device. Inviting players and co-referees arrives with sign-in.</p>
  </section>
  <Modules />
</details>
{/if}

<style>
  .tree, .tree ul { list-style: none; margin: 0.25rem 0 0; padding-left: 1rem; }
  .tree { padding-left: 0; }
  .tree li { margin: 0.3rem 0; }
  .tree ul { border-left: 1px solid var(--line); }
  .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); text-decoration: underline; font: inherit; }
</style>
