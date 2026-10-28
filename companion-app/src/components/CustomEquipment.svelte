<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { downloadJson } from '../lib/storage';
  import { publishCampaign } from '../lib/campaign';
  import {
    EquipmentError, LOCAL_ID, RARITIES, checkEquipment,
    type EquipmentFileData, type EquipmentItem, type ItemKind, type MagicEntry, type MagicSystem, type Rarity
  } from '../equipment/equipment';
  import { RULESETS, isBuiltInRules } from '../rules/rules';

  // This device's custom equipment file ("local"): referee-approved items, spells and
  // dweomers that aren't in the book. Referees can publish it as a campaign.

  type Kind = Exclude<ItemKind, 'armor'> | MagicSystem;
  const KINDS: { kind: Kind; label: string }[] = [
    { kind: 'weapon', label: 'Weapon' },
    { kind: 'gear', label: 'Gear' },
    { kind: 'mount', label: 'Mount' },
    { kind: 'service', label: 'Service' },
    { kind: 'arcane', label: 'Spell' },
    { kind: 'divine', label: 'Miracle' },
    { kind: 'primal', label: 'Glamour' },
    { kind: 'dweomer', label: 'Dweomer' }
  ];
  const label = (k: string) => KINDS.find((x) => x.kind === k)?.label ?? k;
  const FORMS: NonNullable<MagicEntry['form']>[] = ['weapon', 'armor', 'shield', 'amulet', 'belt', 'boots', 'crown', 'ring', 'wondrous', 'potion'];
  const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary'];

  let entries = $derived([...app.local.items, ...app.local.magic].sort((a, b) => a.name.localeCompare(b.name)));

  // The entry being edited, as form fields. Lists are typed as comma-separated text.
  interface Draft {
    isNew: boolean;
    kind: Kind;
    id: string;
    name: string;
    cost: string;
    encumbrance: string;
    page: string;
    summary: string;
    properties: string;
    size: 'light' | 'medium' | 'heavy';
    ranged: boolean;
    range: string;
    thrown: string;
    reach: string;
    shield: boolean;
    stack: string;
    slots: string;
    tags: string;
    circle: number;
    cantrip: string;
    fast: boolean;
    rarity: Rarity | 'any';
    origins: ('arcane' | 'primal' | 'divine')[];
    form: NonNullable<MagicEntry['form']>;
    ingredients: string;
  }
  let draft = $state<Draft | null>(null);
  let error = $state('');
  let jsonText = $state<string | null>(null);
  let publishing = $state<{ name: string; id: string; referee: string; rules: string } | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? undefined : Number(s));
  const slugify = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function blank(kind: Kind): Draft {
    return {
      isNew: true, kind, id: '', name: '', cost: '', encumbrance: '', page: '', summary: '', properties: '',
      size: 'light', ranged: false, range: '', thrown: '', reach: '', shield: false, stack: '', slots: '',
      tags: '', circle: 1, cantrip: '', fast: false, rarity: 'common', origins: [], form: 'wondrous', ingredients: ''
    };
  }

  function edit(e: EquipmentItem | MagicEntry) {
    const d = blank('kind' in e ? (e.kind as Kind) : e.system);
    const x = e as EquipmentItem & MagicEntry;
    Object.assign(d, {
      isNew: false, id: e.id, name: e.name, cost: text(x.cost), encumbrance: text(x.encumbrance), page: text(e.page),
      summary: e.summary ?? '', properties: (x.properties ?? []).join(', '), size: x.size ?? 'light', ranged: !!x.ranged,
      range: text(x.range), thrown: text(x.thrown), reach: text(x.reach), shield: !!x.shield, stack: x.stack ?? '',
      slots: text(x.slots), tags: (x.tags ?? []).join(', '), circle: x.circle ?? 1, cantrip: x.cantrip ?? '', fast: !!x.fast,
      rarity: x.rarity ?? 'any', origins: [...(x.origins ?? [])], form: x.form ?? 'wondrous', ingredients: (x.ingredients ?? []).join(', ')
    });
    draft = d;
    error = '';
  }

  // Leaves out empty fields, so the file stays as readable as the built-in ones.
  function toEntry(d: Draft): EquipmentItem | MagicEntry {
    const out: Record<string, unknown> = { id: d.id, name: d.name.trim() };
    const put = (k: string, v: unknown) => {
      if (v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && !v.length)) out[k] = v;
    };
    const isMagic = ['arcane', 'divine', 'primal', 'dweomer'].includes(d.kind);
    if (isMagic) {
      out.system = d.kind;
      if (d.kind === 'dweomer') {
        put('rarity', d.rarity === 'any' ? undefined : d.rarity);
        put('origins', d.origins);
        put('form', d.form);
        put('ingredients', list(d.ingredients));
      } else {
        put('circle', d.circle);
        put('tags', list(d.tags));
        if (d.kind === 'arcane') put('cantrip', d.cantrip.trim());
        put('fast', d.fast);
      }
    } else {
      out.kind = d.kind;
      put('cost', num(d.cost));
      put('encumbrance', num(d.encumbrance));
      put('properties', list(d.properties));
      if (d.kind === 'weapon') {
        put('size', d.size);
        put('ranged', d.ranged);
        put('range', num(d.range));
        put('thrown', num(d.thrown));
        put('reach', num(d.reach));
        put('shield', d.shield);
      }
      if (d.kind === 'gear') {
        put('stack', d.stack.trim());
        put('slots', num(d.slots));
      }
    }
    put('page', num(d.page));
    put('summary', d.summary.trim());
    return out as unknown as EquipmentItem | MagicEntry;
  }

  function copyLocal(): EquipmentFileData {
    return JSON.parse(JSON.stringify(app.local));
  }

  async function save(file: EquipmentFileData, message: string) {
    try {
      checkEquipment(file);
      await app.saveLocal(file);
      app.notify(message);
      return true;
    } catch (e) {
      error = e instanceof EquipmentError ? e.message : `Couldn't save: ${(e as Error).message}`;
      return false;
    }
  }

  async function saveDraft() {
    const d = draft!;
    if (!d.name.trim()) {
      error = 'Give it a name';
      return;
    }
    const file = copyLocal();
    if (d.isNew) {
      // Ids are permanent: characters point at them. Make one from the name.
      const taken = new Set([...file.items, ...file.magic].map((e) => e.id));
      const base = slugify(d.name) || 'entry';
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      d.id = id;
    }
    const entry = toEntry(d);
    const key = 'system' in entry ? 'magic' : 'items';
    const listOf = file[key] as { id: string }[];
    const i = listOf.findIndex((e) => e.id === entry.id);
    if (i >= 0) listOf[i] = entry;
    else listOf.push(entry);
    if (await save(file, `Saved ${entry.name}`)) draft = null;
  }

  async function remove(e: EquipmentItem | MagicEntry) {
    if (!confirm(`Delete ${e.name}? Characters that have it keep the name but lose its details.`)) return;
    const file = copyLocal();
    file.items = file.items.filter((x) => x.id !== e.id);
    file.magic = file.magic.filter((x) => x.id !== e.id);
    await save(file, `Deleted ${e.name}`);
  }

  function describe(e: EquipmentItem | MagicEntry): string {
    const x = e as EquipmentItem & MagicEntry;
    if ('system' in e) {
      if (e.system === 'dweomer') return [label('dweomer'), x.rarity ? RARITY_NAMES[RARITIES.indexOf(x.rarity)] : 'any rarity', x.form].filter(Boolean).join(', ');
      return `${label(e.system)}, circle ${x.circle ?? '?'}${x.tags?.length ? ` (${x.tags.join(', ')})` : ''}`;
    }
    return [label(e.kind), x.size, x.cost !== undefined ? `${x.cost} ${app.local.currency ?? 'sp'}` : ''].filter(Boolean).join(', ');
  }

  async function saveJson() {
    try {
      const file = JSON.parse(jsonText ?? '');
      if (await save({ ...file, id: LOCAL_ID }, 'Custom equipment saved')) jsonText = null;
    } catch (e) {
      error = e instanceof SyntaxError ? "That isn't valid JSON" : (e as Error).message;
    }
  }

  // An imported file's entries join this device's; on the same id, the imported one wins.
  async function onImport(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (fileInput) fileInput.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      checkEquipment(data);
      const file = copyLocal();
      let added = 0;
      let replaced = 0;
      for (const key of ['items', 'magic'] as const) {
        for (const e of data[key] as { id: string }[]) {
          const listOf = file[key] as { id: string }[];
          const i = listOf.findIndex((x) => x.id === e.id);
          if (i >= 0) {
            listOf[i] = e;
            replaced++;
          } else {
            listOf.push(e);
            added++;
          }
        }
      }
      await save(file, `Added ${added}${replaced ? `, replaced ${replaced}` : ''}`);
    } catch (e) {
      error = e instanceof SyntaxError ? "That isn't valid JSON" : (e as Error).message;
    }
  }

  function startPublish() {
    publishing = { name: '', id: '', referee: '', rules: 'mm' };
  }

  function publish() {
    const p = publishing!;
    const id = slugify(p.id || p.name);
    if (!p.name.trim() || !id) {
      error = 'Give the campaign a name';
      return;
    }
    const rules = RULESETS.find((r) => r.id === p.rules)!;
    const ids = rules.options.equipment;
    const out = publishCampaign(
      { id, name: p.name.trim(), referee: p.referee.trim(), rules: p.rules, base: Array.isArray(ids) ? ids : [ids] },
      copyLocal()
    );
    downloadJson('campaign.json', out.campaign);
    if (out.equipment) setTimeout(() => downloadJson(out.equipment!.fileName, out.equipment!.data), 300);
    publishing = null;
    app.notify('Downloaded the campaign files');
  }
</script>

<div class="row">
  <button class="ghost" onclick={() => (app.view = { name: 'settings' })}>‹ Settings</button>
  <h1 class="grow">Custom equipment</h1>
</div>

<p class="small muted">
  Items, spells and dweomers your referee has approved. They're on this device only, and they travel with any character you
  export who has them. Armor types come from the rules; for special armor, give ordinary armor a dweomer.
</p>

{#if error}<p class="small failure" role="alert">{error}</p>{/if}

{#if draft}
  {@const d = draft}
  <section class="card form">
    <h3>{d.isNew ? 'New' : 'Edit'} {label(d.kind).toLowerCase()}</h3>
    <label>Name <input bind:value={d.name} /></label>
    {#if d.kind === 'weapon' || d.kind === 'gear' || d.kind === 'mount' || d.kind === 'service'}
      <div class="grid">
        <label>Cost <input inputmode="decimal" bind:value={d.cost} placeholder={app.local.currency ?? 'sp'} /></label>
        <label>Encumbrance <input inputmode="decimal" bind:value={d.encumbrance} /></label>
        {#if d.kind === 'weapon'}
          <label>Size
            <select bind:value={d.size}><option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option></select>
          </label>
          <label>Range <input inputmode="numeric" bind:value={d.range} placeholder="—" /></label>
          <label>Thrown <input inputmode="numeric" bind:value={d.thrown} placeholder="—" /></label>
          <label>Reach <input inputmode="numeric" bind:value={d.reach} placeholder="—" /></label>
          <label class="check"><input type="checkbox" bind:checked={d.ranged} /> Ranged</label>
          <label class="check"><input type="checkbox" bind:checked={d.shield} /> Shield</label>
        {/if}
        {#if d.kind === 'gear'}
          <label>Comes as <input bind:value={d.stack} placeholder="quiver of 20" /></label>
          <label>Pockets <input inputmode="numeric" bind:value={d.slots} placeholder="—" /></label>
        {/if}
      </div>
      <label>Properties <input bind:value={d.properties} placeholder="Simple, Piercing" /></label>
    {:else if d.kind === 'dweomer'}
      <div class="grid">
        <label>Rarity
          <select bind:value={d.rarity}>
            <option value="any">Any</option>
            {#each RARITIES as r, i}<option value={r}>{RARITY_NAMES[i]}</option>{/each}
          </select>
        </label>
        <label>Form
          <select bind:value={d.form}>{#each FORMS as f}<option value={f}>{f}</option>{/each}</select>
        </label>
      </div>
      <div class="row small">
        Made by
        {#each ['arcane', 'divine', 'primal'] as const as o}
          <label class="check"><input type="checkbox" checked={d.origins.includes(o)}
            onchange={(e) => (d.origins = (e.target as HTMLInputElement).checked ? [...d.origins, o] : d.origins.filter((x) => x !== o))} /> {o}</label>
        {/each}
      </div>
      <label>Ingredients <input bind:value={d.ingredients} placeholder="giant spider venom, Wood materia" /></label>
    {:else}
      <div class="grid">
        <label>Circle
          <select bind:value={d.circle}>{#each [1, 2, 3, 4, 5] as n}<option value={n}>{n}</option>{/each}</select>
        </label>
        <label class="check"><input type="checkbox" bind:checked={d.fast} /> Fast</label>
      </div>
      <label>{d.kind === 'arcane' ? 'Schools' : d.kind === 'divine' ? 'Domains' : 'Families'} <input bind:value={d.tags} placeholder="Flame, Conjuration" /></label>
      {#if d.kind === 'arcane'}<label>Cantrip <input bind:value={d.cantrip} /></label>{/if}
    {/if}
    <label>Summary <textarea rows="3" bind:value={d.summary} placeholder="What it does, in a line or two"></textarea></label>
    <label class="short">Page <input inputmode="numeric" bind:value={d.page} placeholder="—" /></label>
    <div class="row">
      <button class="primary" onclick={saveDraft}>Save</button>
      <button onclick={() => { draft = null; error = ''; }}>Cancel</button>
    </div>
  </section>
{:else if jsonText !== null}
  <section class="card">
    <textarea class="json" bind:value={jsonText} spellcheck="false" aria-label="Custom equipment as JSON"></textarea>
    <div class="row">
      <button class="primary" onclick={saveJson}>Save JSON</button>
      <button onclick={() => { jsonText = null; error = ''; }}>Cancel</button>
    </div>
  </section>
{:else if publishing}
  {@const p = publishing}
  <section class="card form">
    <h3>Publish as campaign</h3>
    <p class="small muted">
      This downloads <code>campaign.json</code>{entries.length ? ' and your custom equipment file' : ''}. Put them in the same folder on a
      site anyone can read, such as GitHub Pages or a GitHub gist, and give your players the link to <code>campaign.json</code>.
      Their app then uses these rules and this equipment for your game.
    </p>
    <label>Campaign name <input bind:value={p.name} placeholder="The Pale Keep" /></label>
    <label>Referee <input bind:value={p.referee} placeholder="Your name" /></label>
    <label>Short id <input bind:value={p.id} placeholder={slugify(p.name) || 'pale-keep'} autocapitalize="off" /></label>
    <label>Rules
      <select bind:value={p.rules}>{#each RULESETS.filter((r) => isBuiltInRules(r.id)) as r}<option value={r.id}>{r.name}</option>{/each}</select>
    </label>
    <div class="row">
      <button class="primary" onclick={publish}>Download files</button>
      <button onclick={() => { publishing = null; error = ''; }}>Cancel</button>
    </div>
  </section>
{:else}
  <section class="card">
    {#if entries.length}
      <ul class="entries">
        {#each entries as e (e.id)}
          <li>
            <div class="grow">
              <strong>{e.name}</strong>
              <div class="small muted">{describe(e)}</div>
            </div>
            <button onclick={() => edit(e)}>Edit</button>
            <button class="ghost" aria-label="Delete {e.name}" onclick={() => remove(e)}>✕</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="small muted">Nothing yet.</p>
    {/if}
    <label class="add">Add
      <select value="" onchange={(e) => { const k = (e.target as HTMLSelectElement).value as Kind; if (k) { draft = blank(k); error = ''; } }}>
        <option value="">Choose…</option>
        {#each KINDS as k}<option value={k.kind}>{k.label}</option>{/each}
      </select>
    </label>
  </section>

  <section class="card" style="margin-top:0.75rem">
    <div class="row">
      <button onclick={() => downloadJson('custom-equipment.json', app.local)} disabled={!entries.length}>Export</button>
      <button onclick={() => fileInput?.click()}>Import</button>
      <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onImport} />
      <button onclick={() => (jsonText = JSON.stringify(app.local, null, 2))}>Edit as JSON</button>
    </div>
    <p class="small muted">Referees: <button class="link" onclick={startPublish}>publish this as a campaign</button> so players' apps use your rules and equipment.</p>
  </section>
{/if}

<style>
  .form { display: flex; flex-direction: column; gap: 0.5rem; }
  .form h3 { margin: 0; }
  .form label { display: flex; flex-direction: column; font-size: 0.8rem; color: var(--muted); gap: 0.15rem; }
  .form label.check { flex-direction: row; align-items: center; gap: 0.3rem; color: var(--ink); }
  .form label.short { max-width: 6rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: 0.5rem; align-items: end; }
  .grid input, .grid select { min-width: 0; }
  .entries { list-style: none; margin: 0 0 0.75rem; padding: 0; }
  .entries li { display: flex; gap: 0.5rem; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid var(--line); }
  .grow { flex: 1; min-width: 0; }
  .add { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
  .json { width: 100%; box-sizing: border-box; height: 20rem; font: 0.75rem/1.35 ui-monospace, Menlo, monospace; }
  .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); text-decoration: underline; font: inherit; }
</style>
