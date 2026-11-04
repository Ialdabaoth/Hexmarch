<script lang="ts">
  import { app } from '../lib/app.svelte';
  import Maps from './Maps.svelte';
  import Modules from './Modules.svelte';

  // The game being played: which campaign, its parties, maps, events, history and
  // procedures, and who is in it. Shared campaigns arrive with sign-in; for now
  // everything lives on this device.
  let busy = $state(false);

  async function choose(url: string) {
    busy = true;
    try {
      if (url) await app.switchCampaign(url);
      else await app.leaveCampaign();
    } catch (e) {
      app.notify((e as Error).message);
    }
    busy = false;
  }

  async function refresh() {
    busy = true;
    try {
      await app.useCampaign(app.settings.campaign);
    } catch (e) {
      app.notify((e as Error).message);
    }
    busy = false;
  }

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

<section class="card">
  <label for="which" style="margin-top:0">Campaign</label>
  <select id="which" value={app.campaign ? app.settings.campaign : ''} disabled={busy}
    onchange={(e) => choose((e.target as HTMLSelectElement).value)}>
    <option value="">This device</option>
    {#each Object.values(app.campaigns) as c (c.url)}<option value={c.url}>{c.campaign.name}</option>{/each}
  </select>
  {#if app.campaign}
    <p class="small muted">
      Run by {app.campaign.campaign.referee || 'your referee'}. Checked {new Date(app.campaign.fetchedAt).toLocaleDateString()}.
      <button class="link" disabled={busy} onclick={refresh}>Check for changes</button>
    </p>
  {:else}
    <p class="small muted">Your characters, maps and notes on this phone. Joining a referee's campaign arrives with sign-in.</p>
  {/if}
</section>

<details class="section" open>
  <summary><h2>Parties</h2></summary>
  {#if app.characters.length}
    <ul class="tree">
      <li>
        <strong>Party</strong> <span class="small muted">· active</span>
        <ul>
          {#each app.characters as c (c.id)}
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

<Maps />

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
