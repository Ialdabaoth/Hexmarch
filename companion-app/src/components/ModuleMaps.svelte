<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { viewerUrl, type SavedModule } from '../lib/modules';
  import { isViewerMessage, type ViewerHex } from '../lib/viewer';

  // A module's maps in two frames: the map alone (?mode=map) and its atlas of pages
  // (?mode=atlas). A page picked in the atlas opens in the map; tapping a hex shows
  // what's there, and the party can be placed on it.
  const HOME_MODULES = 'https://ialdabaoth.github.io/MateriaMundiRPG/';

  let mapFrame = $state<HTMLIFrameElement>();
  let atlasFrame = $state<HTMLIFrameElement>();
  let chosen = $state('');
  let picked = $state<ViewerHex | null>(null);
  let showing = $state({ hash: '#world', title: '', small: '' });
  let busy = $state(false);
  let problem = $state('');

  const keyOf = (m: SavedModule) => `${m.base}${m.id}`;
  let current = $derived(app.modules.find((m) => keyOf(m) === chosen) ?? app.modules[0]);
  let at = $derived(app.settings.partyAt);
  let here = $derived(!!current && !!at && at.base === current.base && at.module === current.id);
  let base = $derived(current ? viewerUrl(current.base, current.path ?? `${current.id}/`) : '');
  // The first page shown: where the party is, or the whole module. Later moves happen inside
  // the frames, so moving the party doesn't reload the map.
  let start = $derived.by(() => {
    void base;
    return untrack(() => (here && at ? `#${at.map}:${at.hex}` : '#world'));
  });

  const post = (frame: HTMLIFrameElement | undefined, msg: object) => frame?.contentWindow?.postMessage({ type: 'mm-viewer', ...msg }, '*');

  function sendMarks() {
    post(mapFrame, { marks: here && at ? [{ map: at.map, hex: at.hex, label: 'P' }] : [] });
  }

  function onMessage(e: MessageEvent) {
    if (!isViewerMessage(e.data)) return;
    const d = e.data;
    if (mapFrame && e.source === mapFrame.contentWindow) {
      if (d.event === 'view') {
        sendMarks();
        showing = { hash: d.hash, title: d.title ?? '', small: d.small ?? '' };
        post(atlasFrame, { current: d.hash });
        if (!d.hash.includes(':')) picked = null;
      } else if (d.event === 'hex') picked = d;
    } else if (atlasFrame && e.source === atlasFrame.contentWindow && d.event === 'select') {
      post(mapFrame, { show: d.hash });
    }
  }

  async function placeParty() {
    if (!picked || !current) return;
    const where = `${picked.hex}, ${picked.scale}${picked.terrainName ? `, ${picked.terrainName}` : ''}`;
    await app.updateSettings({ partyAt: { base: current.base, module: current.id, map: picked.map, hex: picked.hex, label: where } });
    sendMarks();
    app.notify(`Party moved to hex ${picked.hex}`);
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
  {#key base}
    <div class="row head">
      <span class="grow"><strong>{showing.title || current.manifest.title}</strong> <span class="small muted">{showing.small}</span></span>
      {#if showing.hash !== '#world'}<button class="ghost small" onclick={() => post(mapFrame, { show: '#world' })}>Whole map</button>{/if}
    </div>
    <div class="frame">
      <iframe bind:this={mapFrame} class="map" src="{base}?mode=map{start}" title="{current.manifest.title}: map" onload={sendMarks}></iframe>
    </div>
    <div class="row small bar">
      <span class="grow muted">
        {#if here && at}Party: hex {at.label} <button class="link" onclick={() => post(mapFrame, { show: `#${at.map}:${at.hex}` })}>Show</button>
        {:else}Tap a hex to see what's there.{/if}
      </span>
      <a href="{base}{showing.hash}" target="_blank" rel="noopener">Full screen</a>
    </div>
    {#if picked}
      <section class="card picked">
        <strong>Hex {picked.hex}</strong> <span class="small muted">{picked.scale}{picked.terrainName ? ` · ${picked.terrainName}` : ''}</span>
        {#if picked.sites.length}
          <div class="small">Sites: {#each picked.sites as s, i (s.slug)}{i ? ', ' : ''}<button class="link" onclick={() => post(mapFrame, { show: s.href })}>{s.name}</button>{/each}</div>
        {/if}
        <div class="row" style="margin-top:0.5rem">
          <button class="primary" onclick={placeParty} disabled={here && at?.map === picked.map && at?.hex === picked.hex}>Move the party here</button>
        </div>
      </section>
    {/if}
    <details class="atlas" open>
      <summary class="small muted">Atlas and exploration pages</summary>
      <div class="frame">
        <iframe bind:this={atlasFrame} class="list" src="{base}?mode=atlas{start}" title="{current.manifest.title}: atlas"></iframe>
      </div>
    </details>
  {/key}
{:else}
  <section class="card">
    <p class="small muted" style="margin-top:0">
      No module maps on this device yet. Add the Beyond the Pale maps (Leinster, 1422), or add another module's site under Manage › Modules.
    </p>
    <button class="primary" onclick={addBeyondThePale} disabled={busy}>{busy ? 'Adding…' : 'Add Beyond the Pale maps'}</button>
    {#if problem}<p class="small failure" role="alert">{problem}</p>{/if}
  </section>
{/if}

<style>
  .head { margin-bottom: 0.35rem; flex-wrap: nowrap; }
  .head button { min-height: 0; padding: 0.2rem 0.5rem; }
  .frame { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--card); }
  iframe { display: block; width: 100%; border: 0; }
  iframe.map { height: 62vh; }
  iframe.list { height: 45vh; }
  .bar { margin-top: 0.4rem; flex-wrap: nowrap; }
  .bar a { color: var(--accent); white-space: nowrap; }
  .picked { margin-top: 0.5rem; }
  .atlas { margin-top: 0.75rem; }
  .atlas summary { cursor: pointer; margin-bottom: 0.35rem; }
  .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); text-decoration: underline; font: inherit; }
</style>
