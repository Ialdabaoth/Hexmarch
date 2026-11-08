<script lang="ts">
  import { app } from '../lib/app.svelte';
  import Maps from './Maps.svelte';
  import ModuleMaps from './ModuleMaps.svelte';
  import Modules from './Modules.svelte';
  import Art from './Art.svelte';
  import Creatures from './Creatures.svelte';
  import CampaignState from './CampaignState.svelte';

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
  <summary><h2>Parties</h2></summary>
  {#if app.party.length}
    <ul class="tree">
      <li>
        <strong>Party</strong> <span class="small muted">· active{app.state.party ? ` · hex ${app.state.party.label}` : ''}</span>
        <ul>
          {#each app.party as c (c.id)}
            <li>
              <button class="link" onclick={() => open(c.id)}>{c.name}</button>
              <span class="small muted">{className(c)} {c.level}</span>
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
  <CampaignState />
</details>

<details class="section" open>
  <summary><h2>Creatures</h2></summary>
  <Creatures />
</details>

<details class="section" open>
  <summary><h2>Maps</h2></summary>
  <ModuleMaps />
  <Maps />
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

<style>
  .tree, .tree ul { list-style: none; margin: 0.25rem 0 0; padding-left: 1rem; }
  .tree { padding-left: 0; }
  .tree li { margin: 0.3rem 0; }
  .tree ul { border-left: 1px solid var(--line); }
  .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); text-decoration: underline; font: inherit; }
</style>
