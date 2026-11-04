<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { viewerUrl, type SavedModule } from '../lib/modules';
  import { isViewerMessage, type ViewerHex } from '../lib/viewer';

  // A module's maps in an embedded viewer. Tapping a hex shows what's there, and the
  // party can be placed on it; the viewer draws the party's marker.
  const SEASON_1 = 'https://ialdabaoth.github.io/MateriaMundiRPG/';

  let frame = $state<HTMLIFrameElement>();
  let chosen = $state('');
  let picked = $state<ViewerHex | null>(null);
  let busy = $state(false);
  let problem = $state('');

  const keyOf = (m: SavedModule) => `${m.base}${m.id}`;
  let current = $derived(app.modules.find((m) => keyOf(m) === chosen) ?? app.modules[0]);
  let at = $derived(app.settings.partyAt);
  let here = $derived(!!current && !!at && at.base === current.base && at.module === current.id);
  let base = $derived(current ? viewerUrl(current.base, current.path ?? `${current.id}/`) : '');
  // The first page shown: where the party is, or the whole module. Later moves happen inside
  // the frame, so moving the party doesn't reload the map.
  let src = $derived.by(() => {
    if (!base) return '';
    const start = untrack(() => (here && at ? `${at.map}:${at.hex}` : 'world'));
    return `${base}#${start}`;
  });

  function sendMarks() {
    const marks = here && at ? [{ map: at.map, hex: at.hex, label: 'P' }] : [];
    frame?.contentWindow?.postMessage({ type: 'mm-viewer', marks }, '*');
  }

  function onMessage(e: MessageEvent) {
    if (!frame || e.source !== frame.contentWindow || !isViewerMessage(e.data)) return;
    if (e.data.event === 'view') {
      sendMarks();
      if (!e.data.hash.includes(':')) picked = null;
    } else if (e.data.event === 'hex') picked = e.data;
  }

  async function placeParty() {
    if (!picked || !current) return;
    const where = `${picked.hex}, ${picked.scale}${picked.terrainName ? `, ${picked.terrainName}` : ''}`;
    await app.updateSettings({ partyAt: { base: current.base, module: current.id, map: picked.map, hex: picked.hex, label: where } });
    sendMarks();
    app.notify(`Party moved to hex ${picked.hex}`);
  }

  async function addSeason1() {
    busy = true;
    problem = '';
    try {
      await app.addModuleRepo(SEASON_1);
    } catch (e) {
      problem = (e as Error).message;
    }
    busy = false;
  }

  function show(hash: string) {
    frame?.contentWindow?.postMessage({ type: 'mm-viewer', show: hash }, '*');
  }
</script>

<svelte:window onmessage={onMessage} />

{#if current}
  {#if app.modules.length > 1}
    <select bind:value={chosen} aria-label="Module" style="margin-bottom:0.5rem">
      {#each app.modules as m (keyOf(m))}<option value={keyOf(m)}>{m.manifest.title}</option>{/each}
    </select>
  {/if}
  <div class="frame">
    {#key src}
      <iframe bind:this={frame} {src} title="{current.manifest.title} maps" onload={sendMarks}></iframe>
    {/key}
  </div>
  <div class="row small bar">
    <span class="grow muted">
      {#if here && at}Party: hex {at.label} <button class="link" onclick={() => show(`#${at.map}:${at.hex}`)}>Show</button>
      {:else}Tap a hex to see what's there.{/if}
    </span>
    <a href={src} target="_blank" rel="noopener">Full screen</a>
  </div>
  {#if picked}
    <section class="card picked">
      <strong>Hex {picked.hex}</strong> <span class="small muted">{picked.scale}{picked.terrainName ? ` · ${picked.terrainName}` : ''}</span>
      {#if picked.sites.length}<div class="small">Sites: {picked.sites.map((s) => s.name).join(', ')}</div>{/if}
      <div class="row" style="margin-top:0.5rem">
        <button class="primary" onclick={placeParty} disabled={here && at?.map === picked.map && at?.hex === picked.hex}>Move the party here</button>
      </div>
    </section>
  {/if}
{:else}
  <section class="card">
    <p class="small muted" style="margin-top:0">
      No module maps on this device yet. Add the Season 1 maps (Leinster, 1422), or add another module's site under Manage › Modules.
    </p>
    <button class="primary" onclick={addSeason1} disabled={busy}>{busy ? 'Adding…' : 'Add Season 1 maps'}</button>
    {#if problem}<p class="small failure" role="alert">{problem}</p>{/if}
  </section>
{/if}

<style>
  .frame { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--card); }
  iframe { display: block; width: 100%; height: 72vh; border: 0; }
  .bar { margin-top: 0.4rem; flex-wrap: nowrap; }
  .bar a { color: var(--accent); white-space: nowrap; }
  .picked { margin-top: 0.5rem; }
  .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); text-decoration: underline; font: inherit; }
</style>
