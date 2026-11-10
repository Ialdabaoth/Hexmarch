<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { viewerUrl, type SavedModule } from '../lib/modules';
  import { atlasUrl, isAtlasAddress, isAtlasMessage, } from '../lib/atlas';
  import { writeState, type CampaignState } from '../lib/state';

  // A module's map is the Atlas (<site>/atlas/?module=<id>), embedded whole: its own key,
  // Route and Party tools. The Atlas tells this page where it is (for the full-screen link) and
  // where the party stands, which is kept in the campaign state file and handed back each time the map opens.
  const HOME_MODULES = __DATA_URL__; // site.json "data.url": the Materia Mundi module site

  let frame = $state<HTMLIFrameElement>();
  let chosen = $state('');
  let showing = $state('#world');
  let busy = $state(false);
  let problem = $state('');

  const keyOf = (m: SavedModule) => `${m.base}${m.id}`;
  let at = $derived(app.currentParty?.at ?? null);
  // until one is picked: the module the party is in, else the first with an Atlas map
  let current = $derived(
    app.modules.find((m) => keyOf(m) === chosen) ??
      app.modules.find((m) => at && m.base === at.base && m.id === at.module && m.manifest.atlas_map) ??
      app.modules.find((m) => m.manifest.atlas_map) ??
      app.modules[0]
  );
  let here = $derived(!!current && !!at && at.base === current.base && at.module === current.id);
  let atlas = $derived(current?.manifest.atlas_map ? atlasUrl(current.base, current.id) : '');
  // The first view: the party's hex if it is on the new grid, or the whole region. Later moves
  // happen inside the Atlas, so moving the party doesn't reload the map.
  let start = $derived.by(() => {
    void atlas;
    return untrack(() => (here && at && isAtlasAddress(at.hex) ? `#${at.hex}` : '#world'));
  });

  const post = (msg: object) => frame?.contentWindow?.postMessage({ type: 'hexmarch-atlas', ...msg }, '*');

  // The whole state file (Atlas 0.5.11): every party with its clock, session and place, and `active`; the Atlas
  // gets it again after every change.
  function sendState() {
    post({ state: writeState($state.snapshot(app.state) as CampaignState) });
  }
  $effect(() => {
    void app.state.revision;
    untrack(() => frame && sendState());
  });

  // Each character with what it knows (Atlas 0.5.12, character mode: the map shown as one creature sees it).
  // An older Atlas ignores it.
  // Player mode (Heph 2026-11-09): the Atlas gets only the player's own character and is locked to it, so the map
  // shows what that character knows and nothing else; the referee's view, the fog brush and party moves are gone.
  let player = $derived(app.mode === 'player');
  let mine = $derived(player ? app.sheets.filter((s) => s.id === app.invitation?.character) : app.sheets);
  function sendCharacters() {
    post({
      characters: mine.map((s) => ({ id: s.id, name: s.name, owner: s.owner, knowledge: $state.snapshot(s.knowledge) })),
      ...(player ? { as: app.invitation?.character ?? '', lock: true } : {})
    });
  }
  $effect(() => {
    void player;
    for (const s of mine) void [s.name, s.owner, JSON.stringify(s.knowledge)];
    untrack(() => frame && sendCharacters());
  });
  // A player's full-screen map stays locked to their character.
  let lockQuery = $derived(player ? `${atlas.includes('?') ? '&' : '?'}as=${encodeURIComponent(app.invitation?.character ?? '')}&lock=1` : '');

  // The Atlas may still be loading its map when the frame loads, so everything is sent again when it first reports its view.
  let greeted = false;
  function onLoad() {
    greeted = false;
    sendCharacters();
    sendState();
  }

  async function onMessage(e: MessageEvent) {
    if (!frame || e.source !== frame.contentWindow || !current || !isAtlasMessage(e.data)) return;
    const d = e.data;
    if (d.module !== current.id) return;
    if (d.event === 'knowledge') {
      await app.addKnowledge(player ? d.ids.filter((id) => id === app.invitation?.character) : d.ids, d.add, d.remove);
      return;
    }
    if (d.event === 'view') {
      showing = d.hash;
      if (!greeted) {
        greeted = true;
        sendCharacters();
        sendState();
      }
    }
    else if (player) {
      // parties are the referee's to make, pick and move
    } else if (d.event === 'party-new') {
      await app.newParty(d.party);
    } else if (d.event === 'active') {
      await app.chooseParty(d.party);
    } else if (d.hex === null) {
      const p = app.state.parties.find((x) => x.id === d.party);
      if (p?.at && p.at.base === current.base && p.at.module === current.id) await app.setParty(null, d.party);
    } else {
      await app.setParty({ base: current.base, module: current.id, map: 'atlas', hex: d.hex, label: d.hex.slice(6), hours: d.hours }, d.party);
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
    <select value={keyOf(current)} onchange={(e) => (chosen = (e.target as HTMLSelectElement).value)} aria-label="Module" style="margin-bottom:0.5rem">
      {#each app.modules as m (keyOf(m))}<option value={keyOf(m)}>{m.manifest.title}</option>{/each}
    </select>
  {/if}
  {#if atlas}
    {#key atlas}
      <div class="frame">
        <iframe bind:this={frame} src="{atlas}{lockQuery}{start}" title="{current.manifest.title}: Atlas" onload={onLoad}></iframe>
      </div>
      <div class="strip small muted">
        {#if here && at}Party: hex {at.label} <button class="link" onclick={() => post({ show: `#${at!.hex}` })}>Show</button> ·
        {:else if !player}Use the Atlas's Party button to place the party. ·{/if}
        <a href="{atlas}{lockQuery}{showing}" target="_blank" rel="noopener">Full screen</a>
      </div>
    {/key}
  {:else}
    <section class="card">
      <p class="small muted" style="margin-top:0">{current.manifest.title} has no Atlas map. Its own pages may still have maps.</p>
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
