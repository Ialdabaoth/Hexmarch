<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { expressionRoll, thresholdCheck } from '../lib/checks';
  import { sheetView, type RollRequest } from '../lib/render';
  import { exportBundle, importFile } from '../lib/sheet';
  import { downloadJson } from '../lib/storage';
  import Postcard from './Postcard.svelte';
  import HpEditor from './HpEditor.svelte';
  import XpEditor from './XpEditor.svelte';
  import GearPicker from './GearPicker.svelte';
  import PrepPicker from './PrepPicker.svelte';
  import RollLog from './RollLog.svelte';
  import { portraitFromFile } from '../lib/portrait';

  let fileInput = $state<HTMLInputElement>();
  let card = $state<ReturnType<typeof Postcard>>();
  let page = $state(0);
  let editingHp = $state(false);
  let editingXp = $state(false);
  let pickingGear = $state<'armor' | 'main' | 'off' | null>(null);
  let preparingCircle = $state<number | null>(null);
  let jsonText = $state<string | null>(null);
  let tab = $state<'log' | 'backup'>('log');

  // Use a preparation, or prepare a spent one again (it keeps its slot).
  function togglePrep(i: number) {
    const p = active?.data.inventory.prepared[i];
    const magic = active && active.rules.getClass(active.classId).magic;
    if (!p || !magic) return;
    p.spent = !p.spent;
    app.persist();
    app.notify(`${p.spent ? 'Used' : 'Prepared'}: ${p.magic || magic.prepared.toLowerCase()}`);
  }

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

  async function importText(text: string): Promise<boolean> {
    try {
      const imported = importFile(JSON.parse(text));
      await app.upsert(imported);
      app.notify(`Imported ${imported.length} character${imported.length === 1 ? '' : 's'}`);
      return true;
    } catch (err) {
      app.notify(err instanceof SyntaxError ? "That isn't valid JSON" : (err as Error).message);
      return false;
    }
  }

  async function onImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await importText(await file.text());
    if (fileInput) fileInput.value = '';
  }

  // Copy and paste for when files are awkward, as on a phone or between apps.
  function toggleJson() {
    jsonText = jsonText === null ? JSON.stringify(exportBundle(app.sheets), null, 2) : null;
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(jsonText ?? '');
      app.notify('Copied');
    } catch {
      app.notify("Couldn't copy; select the text and copy it instead");
    }
  }

  async function importPasted() {
    if (jsonText && (await importText(jsonText))) jsonText = null;
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
  <Postcard bind:this={card} {view} layout="carousel" onroll={roll} onpage={(i) => (page = i)} onhp={() => (editingHp = true)} onportraitfile={setPortrait} onxp={() => (editingXp = true)} ongear={(slot) => (pickingGear = slot)} oncarry={() => (app.view = { name: 'sheet', id: active!.id, section: 'inventory' })} onprep={togglePrep} onprepslot={(n) => (preparingCircle = n)} />
  {#if pickingGear}<GearPicker character={active} slot={pickingGear} onclose={() => (pickingGear = null)} />{/if}
  {#if preparingCircle !== null}<PrepPicker character={active} circle={preparingCircle} onclose={() => (preparingCircle = null)} />{/if}
  {#if editingXp}<XpEditor character={active} onclose={() => (editingXp = false)} />{/if}
  {#if editingHp}<HpEditor character={active} onclose={() => (editingHp = false)} />{/if}

  <div class="pager">
    {#each ['Front', 'Back'] as label, i}
      <button class:on={page === i} onclick={() => { page = i; card?.showPage(i); }}>{label}</button>
    {/each}
  </div>
{:else}
  <div class="card empty">
    <p>No characters yet.</p>
    <p class="muted small">Roll one up, or import a saved sheet.</p>
    <button class="primary" onclick={() => (app.view = { name: 'build' })}>New character</button>
  </div>
{/if}

<section class="tabs-panel">
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'log'} class:on={tab === 'log'} onclick={() => (tab = 'log')}>Session (Rolls/Results/History)</button>
    <button role="tab" aria-selected={tab === 'backup'} class:on={tab === 'backup'} onclick={() => (tab = 'backup')}>Character (Print/Backup/Import)</button>
  </div>
  {#if tab === 'log'}
    {#if active}
      <p class="small muted hint">Tap a number to roll it, or hold and slide up for Easy, down for Hard. Tap HP, XP, armor, a hand or the portrait to change them. Swipe to turn the card over.</p>
    {/if}
    <RollLog />
  {:else}
    <div class="backup">
      {#if active}
        <div class="row actions">
          <button class="primary grow" onclick={() => (app.view = { name: 'sheet', id: active.id })}>Full sheet</button>
          <button onclick={() => (app.view = { name: 'render', id: active.id, mode: 'postcard' })}>PDF</button>
        </div>
      {/if}
      <div class="row">
        <button onclick={() => downloadJson('materia-mundi-characters.json', exportBundle(app.sheets))} disabled={!app.sheets.length}>Export all (JSON)</button>
        <button onclick={() => fileInput?.click()}>Import JSON</button>
        <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onImport} />
        <button onclick={toggleJson}>{jsonText === null ? 'Show JSON (copy / paste)' : 'Hide JSON'}</button>
      </div>
      {#if jsonText !== null}
        <textarea class="json" bind:value={jsonText} spellcheck="false" aria-label="Characters as JSON"></textarea>
        <div class="row">
          <button onclick={copyJson}>Copy</button>
          <button onclick={() => (jsonText = '')}>Clear</button>
          <button class="primary" onclick={importPasted} disabled={!jsonText.trim()}>Import pasted</button>
        </div>
      {/if}
      <p class="muted small">Characters live only on this device. Export a backup now and then, or to move them to another phone.</p>
    </div>
  {/if}
</section>

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
  .hint { margin: 0 0 0.6rem; }
  .actions { margin-bottom: 0.75rem; }
  .empty { text-align: center; }
  .empty p { margin: 0.25rem 0 0.75rem; }
  .tabs-panel { margin-top: 0.75rem; }
  .tabs { display: flex; border-bottom: 1px solid var(--line); margin-bottom: 0.6rem; }
  .tabs button { flex: 1; min-height: 40px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; color: var(--muted); font-size: 0.9rem; }
  .tabs button.on { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
  .backup .row { flex-wrap: wrap; }
  .json { width: 100%; box-sizing: border-box; height: 14rem; margin: 0.5rem 0; font: 0.75rem/1.35 ui-monospace, Menlo, monospace; }
</style>
