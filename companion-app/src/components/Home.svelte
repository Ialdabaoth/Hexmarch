<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { expressionRoll, thresholdCheck } from '../lib/checks';
  import { sheetView, type RollRequest } from '../lib/render';
  import { exportBundle, importFile } from '../lib/sheet';
  import { downloadJson } from '../lib/storage';
  import Postcard from './Postcard.svelte';
  import HpEditor from './HpEditor.svelte';
  import XpEditor from './XpEditor.svelte';
  import { portraitFromFile } from '../lib/portrait';

  let fileInput = $state<HTMLInputElement>();
  let card = $state<ReturnType<typeof Postcard>>();
  let page = $state(0);
  let editingHp = $state(false);
  let editingXp = $state(false);

  async function setPortrait(file: File) {
    if (!active) return;
    try {
      active.data.portrait = await portraitFromFile(file);
      app.persist();
    } catch {
      app.notify("Couldn't read that image");
    }
  }

  let active = $derived(app.characters.find((c) => c.id === app.settings.activeId) ?? app.characters[0]);
  let view = $derived(active ? sheetView(active.data, active.state) : undefined);

  function select(id: string) {
    app.updateSettings({ activeId: id });
    page = 0;
    card?.showPage(0);
  }

  function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  }

  async function roll(r: RollRequest) {
    if (!active) return;
    try {
      const entry =
        r.kind === 'check'
          ? thresholdCheck({
              who: active.name,
              label: r.label,
              sides: r.sides,
              threshold: r.threshold,
              difficulty: r.difficulty ?? 'normal',
              improvedCritical: r.attack && active.rules.getClass(active.classId).improvedCritical
            })
          : expressionRoll({ who: active.name, label: r.label, expression: r.expression, min: r.min });
      await app.record(entry);
    } catch (e) {
      app.notify((e as Error).message);
    }
  }

  async function onImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const imported = importFile(JSON.parse(await file.text()));
      await app.upsert(imported);
      app.notify(`Imported ${imported.length} character${imported.length === 1 ? '' : 's'}`);
    } catch (err) {
      app.notify((err as Error).message);
    }
    if (fileInput) fileInput.value = '';
  }
</script>

<nav class="party" aria-label="Party">
  {#each app.characters as c (c.id)}
    <button class="member" class:on={c.id === active?.id} onclick={() => select(c.id)} aria-label={c.name} title={c.name}>
      {#if c.data.portrait}<img src={c.data.portrait} alt="" />{:else}<span>{initials(c.name)}</span>{/if}
    </button>
  {/each}
  <button class="member add" onclick={() => (app.view = { name: 'build' })} aria-label="New character">+</button>
</nav>

{#if active && view}
  <Postcard bind:this={card} {view} layout="carousel" onroll={roll} onpage={(i) => (page = i)} onhp={() => (editingHp = true)} onportraitfile={setPortrait} onxp={() => (editingXp = true)} />
  {#if editingXp}<XpEditor character={active} onclose={() => (editingXp = false)} />{/if}
  {#if editingHp}<HpEditor character={active} onclose={() => (editingHp = false)} />{/if}

  <div class="pager">
    {#each ['Front', 'Back'] as label, i}
      <button class:on={page === i} onclick={() => { page = i; card?.showPage(i); }}>{label}</button>
    {/each}
  </div>
  <p class="small muted hint">Tap a number to roll it, or hold and slide up for Easy, down for Hard. Tap HP, XP or the portrait to change them. Swipe to turn the card over.</p>

  <div class="row actions">
    <button class="primary grow" onclick={() => (app.view = { name: 'sheet', id: active!.id })}>Full sheet</button>
    <button onclick={() => (app.view = { name: 'render', id: active!.id, mode: 'postcard' })}>PDF</button>
  </div>
{:else}
  <div class="card empty">
    <p>No characters yet.</p>
    <p class="muted small">Roll one up, or import a saved sheet.</p>
    <button class="primary" onclick={() => (app.view = { name: 'build' })}>New character</button>
  </div>
{/if}

<details class="backup">
  <summary class="small muted">Backup and import</summary>
  <div class="row">
    <button onclick={() => downloadJson('materia-mundi-characters.json', exportBundle(app.sheets))} disabled={!app.sheets.length}>Export all (JSON)</button>
    <button onclick={() => fileInput?.click()}>Import JSON</button>
    <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onImport} />
  </div>
  <p class="muted small">Characters live only on this device. Export a backup now and then, or to move them to another phone.</p>
</details>

<style>
  .party {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 2px 2px 10px;
    margin-bottom: 4px;
    scrollbar-width: none;
  }
  .member {
    flex: none;
    width: 52px;
    height: 52px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid var(--line);
    background: var(--card);
    font: 700 1rem Georgia, serif;
    color: var(--muted);
  }
  .member.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); color: var(--accent); }
  .member img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .member.add { border-style: dashed; font-size: 1.4rem; }
  .pager { display: flex; justify-content: center; gap: 0.5rem; margin-top: 0.6rem; }
  .pager button { min-height: 32px; padding: 0.2rem 0.9rem; border-radius: 999px; font-size: 0.85rem; }
  .pager button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
  .hint { text-align: center; margin: 0.4rem 0 0.8rem; }
  .actions { margin-bottom: 1rem; }
  .empty { text-align: center; }
  .empty p { margin: 0.25rem 0 0.75rem; }
  .backup { margin-top: 0.5rem; }
  .backup summary { min-height: 32px; cursor: pointer; }
</style>
