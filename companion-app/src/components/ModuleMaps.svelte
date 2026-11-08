<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { viewerUrl, type SavedModule } from '../lib/modules';
  import { atlasUrl, isAtlasAddress, isAtlasMessage, partyHex } from '../lib/atlas';

  // A module's map is the E9 Atlas (<site>/atlas/?module=<id>), embedded whole: its own key,
  // Route and Party tools. The Atlas tells this page where it is (for the full-screen link) and
  // where the party stands, which is kept in the settings and handed back each time the map opens.
  const HOME_MODULES = 'https://ialdabaoth.github.io/MateriaMundiRPG/';

  let frame = $state<HTMLIFrameElement>();
  let chosen = $state('');
  let showing = $state('#world');
  let busy = $state(false);
  let problem = $state('');

  const keyOf = (m: SavedModule) => `${m.base}${m.id}`;
  let current = $derived(app.modules.find((m) => keyOf(m) === chosen) ?? app.modules[0]);
  let at = $derived(app.settings.partyAt);
  let here = $derived(!!current && !!at && at.base === current.base && at.module === current.id);
  let atlas = $derived(current?.manifest.atlas_map ? atlasUrl(current.base, current.id) : '');
  // The first view: the party's hex if it is on the new grid, or the whole region. Later moves
  // happen inside the Atlas, so moving the party doesn't reload the map.
  let start = $derived.by(() => {
    void atlas;
    return untrack(() => (here && at && isAtlasAddress(at.hex) ? `#${at.hex}` : '#world'));
  });

  const post = (msg: object) => frame?.contentWindow?.postMessage({ type: 'e9-atlas', ...msg }, '*');

  function sendParty() {
    if (here && at) post({ party: { hex: partyHex(at), hours: at.hours ?? 0 } });
  }

  async function onMessage(e: MessageEvent) {
    if (!frame || e.source !== frame.contentWindow || !current || !isAtlasMessage(e.data)) return;
    const d = e.data;
    if (d.module !== current.id) return;
    if (d.event === 'view') showing = d.hash;
    else if (d.hex === null) {
      if (here) await app.updateSettings({ partyAt: null });
    } else {
      await app.updateSettings({ partyAt: { base: current.base, module: current.id, map: 'atlas', hex: d.hex, label: d.hex.slice(6), hours: d.hours } });
    }
  }

  async function addBeyondThePale() {
    busy = true;
    problem = '';
    try {
      await app.addModuleRepo(HOME_MODULES);
    } catch (e) {
      problem = (e as Error).message;
    }
    busy = false;
  }
</script>

<svelte:window onmessage={onMessage} />

{#if current}
  {#if app.modules.length > 1}
    <select bind:value={chosen} aria-label="Module" style="margin-bottom:0.5rem">
      {#each app.modules as m (keyOf(m))}<option value={keyOf(m)}>{m.manifest.title}</option>{/each}
    </select>
  {/if}
  {#if atlas}
    {#key atlas}
      <div class="frame">
        <iframe bind:this={frame} src="{atlas}{start}" title="{current.manifest.title}: E9 Atlas" onload={sendParty}></iframe>
      </div>
      <div class="strip small muted">
        {#if here && at}Party: hex {at.label} <button class="link" onclick={() => post({ show: `#${partyHex(at!)}` })}>Show</button> ·
        {:else}Use the Atlas's Party button to place the party. ·{/if}
        <a href="{atlas}{showing}" target="_blank" rel="noopener">Full screen</a>
      </div>
    {/key}
  {:else}
    <section class="card">
      <p class="small muted" style="margin-top:0">{current.manifest.title} has no E9 Atlas map. Its own pages may still have maps.</p>
      <a class="link" href={viewerUrl(current.base, current.path ?? `${current.id}/`)} target="_blank" rel="noopener">Open its pages</a>
    </section>
  {/if}
{:else}
  <section class="card">
    <p class="small muted" style="margin-top:0">
      No module maps on this device yet. Add the Beyond the Pale maps (The Isle of Mists, 1422), or add another module's site under Manage › Modules.
    </p>
    <button class="primary" onclick={addBeyondThePale} disabled={busy}>{busy ? 'Adding…' : 'Add Beyond the Pale maps'}</button>
    {#if problem}<p class="small failure" role="alert">{problem}</p>{/if}
  </section>
{/if}

<style>
  .frame { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--card); }
  iframe { display: block; width: 100%; height: 75vh; border: 0; }
  .strip { margin-top: 0.4rem; }
  .strip a { color: var(--accent); white-space: nowrap; }
  .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); text-decoration: underline; font: inherit; }
</style>
