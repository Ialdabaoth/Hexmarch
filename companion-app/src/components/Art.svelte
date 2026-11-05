<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { cachedId } from '../lib/portraits';
  import { downloadJson } from '../lib/storage';

  // The campaign's pictures: every portrait the party uses. They live on this device and
  // in the campaign's repository as art.json, so a character opened on another phone
  // gets its face back.
  let pictures = $derived(
    app.usedArt.map((id) => ({
      id,
      src: app.portraits[id] ?? '',
      who: app.sheets.filter((s) => cachedId(s.portrait) === id).map((s) => s.name)
    }))
  );
  let web = $derived(app.sheets.filter((s) => /^https:/.test(s.portrait)));
  let busy = $state(false);
  let fileInput = $state<HTMLInputElement>();

  async function fromCampaign() {
    busy = true;
    try {
      const n = await app.syncArt();
      app.notify(n ? `${n} portrait${n === 1 ? '' : 's'} added from the campaign` : "The campaign's art had nothing new for you");
    } catch (e) {
      app.notify(`Couldn't read the campaign's art: ${(e as Error).message}`);
    }
    busy = false;
  }

  async function load(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const n = await app.addArt(JSON.parse(await file.text()));
      app.notify(n ? `${n} portrait${n === 1 ? '' : 's'} added` : 'No missing portraits in that file');
    } catch (e) {
      app.notify((e as Error).message);
    }
  }
</script>

{#if pictures.length}
  <ul class="art">
    {#each pictures as p (p.id)}
      <li>
        {#if p.src}<img src={p.src} alt="" />{:else}<span class="missing" title="Not on this device yet">?</span>{/if}
        <span class="small">{p.who.join(', ')}</span>
      </li>
    {/each}
  </ul>
{:else}
  <p class="small muted">No pictures yet. Give a character a portrait from their sheet and it shows up here.</p>
{/if}
{#if web.length}
  <p class="small muted">{web.map((s) => s.name).join(', ')} {web.length === 1 ? 'uses a picture' : 'use pictures'} from the web, which stay{web.length === 1 ? 's' : ''} there.</p>
{/if}
{#if app.missingArt.length}
  <p class="small muted">{app.missingArt.length} portrait{app.missingArt.length === 1 ? " isn't" : "s aren't"} on this device yet.</p>
{/if}

<div class="row" style="margin-top:0.5rem">
  {#if app.campaign}
    <button onclick={fromCampaign} disabled={busy || !app.missingArt.length}>Get from the campaign</button>
  {/if}
  <button onclick={() => downloadJson('art.json', app.artFile())} disabled={!pictures.some((p) => p.src)}>Save art file</button>
  <button onclick={() => fileInput?.click()}>Load art file</button>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={load} />
</div>
<p class="small muted">
  {#if app.campaign}
    The campaign's art lives in its repository as <code>art.json</code>, beside the campaign file. Missing portraits come
    from there by themselves. To share yours, save the art file and send it to your referee; sending it straight to the
    repository arrives with sign-in.
  {:else}
    Save the art file to keep your portraits, or to move them to another device along with your characters.
  {/if}
</p>

<style>
  .art { list-style: none; padding: 0; margin: 0.25rem 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 0.6rem; }
  .art li { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; text-align: center; min-width: 0; }
  .art li span.small { overflow-wrap: anywhere; }
  .art img, .missing { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; border: 1px solid var(--line); }
  .missing { display: grid; place-items: center; color: var(--muted); font: 700 1.4rem Georgia, serif; }
</style>
