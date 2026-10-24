<script lang="ts">
  import { app } from '../lib/app.svelte';
  import {
    attackThresholds, carrying, hasExpertise, hitDieLabel, saveThreshold, talentThreshold,
    type Character
  } from '../lib/character';
  import { expressionRoll, thresholdCheck } from '../lib/checks';
  import { downloadJson, slug } from '../lib/storage';
  import { portraitFromFile } from '../lib/portrait';
  import { ABILITIES, TALENTS, type Difficulty } from '../rules/rules';
  import { holdRoll } from '../lib/hold.svelte';
  import Followers from './Followers.svelte';
  import Magic from './Magic.svelte';
  import Effects from './Effects.svelte';
  import XpPanel from './XpPanel.svelte';

  let { id }: { id: string } = $props();

  // c is computed from c.sheet; edits go to the sheet and c follows.
  let c = $derived(app.character(id)) as Character | undefined;
  let cls = $derived(c ? c.rules.getClass(c.classId) : undefined);
  let confirmDelete = $state(false);

  async function setPortrait(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !c) return;
    try {
      c.data.portrait = await portraitFromFile(file);
      save();
    } catch {
      app.notify("Couldn't read that image");
    }
    (e.target as HTMLInputElement).value = '';
  }

  function save() {
    app.persist();
  }

  async function check(label: string, sides: 6 | 20, threshold: number, difficulty: Difficulty, opts: { attack?: boolean } = {}) {
    if (!c) return;
    await app.record(
      thresholdCheck({
        who: c.name,
        label,
        sides,
        threshold,
        difficulty,
        improvedCritical: opts.attack && cls?.improvedCritical
      })
    );
  }

  async function rollExpr(label: string, expression: string) {
    if (!c) return;
    try {
      await app.record(expressionRoll({ who: c.name, label, expression }));
    } catch (e) {
      app.notify((e as Error).message);
    }
  }

  function signed(n: number) {
    return (n > 0 ? '+' : '') + n;
  }

  function adjustHp(delta: number) {
    if (!c) return;
    // Damage taken is what the sheet records; HP is max minus damage.
    c.state.damage = Math.max(0, Math.min(2 * c.sheet.hp(), c.state.damage - delta));
    save();
  }

  function addWeapon() {
    c?.data.inventory.weapons.push({ name: 'Dagger', damage: 'd6', range: 'melee' });
    save();
  }

  async function remove() {
    await app.remove(id);
    app.view = { name: 'list' };
  }
</script>

{#if c && cls}
  {@const atk = attackThresholds(c)}
  {@const carry = carrying(c)}
  <div class="row">
    <button class="ghost" onclick={() => (app.view = { name: 'list' })}>‹ Card</button>
  </div>
  <div class="ident">
    <!-- A real file input under the finger: iOS won't always open a picker from a script. -->
    <label class="portrait">
      {#if c.data.portrait}<img src={c.data.portrait} alt="Portrait of {c.name}" />{:else}<span>+ Portrait</span>{/if}
      <input class="pick" type="file" accept="image/*" aria-label="Set portrait" onchange={setPortrait} />
    </label>
    <div class="grow">
      <input class="name" bind:value={c.data.name} onchange={save} aria-label="Character name" />
      <p class="muted small">
        Level {c.level} {c.rules.getOrigin(c.origin).name} {cls.name} · Hit die {hitDieLabel(c)} · {cls.book ?? c.rules.name} p. {cls.page}
      </p>
      {#if c.data.portrait}<button class="ghost small clear" onclick={() => { c!.data.portrait = ''; save(); }}>Remove portrait</button>{/if}
    </div>
  </div>


  <section class="card">
    <div class="grid3 vitals">
      <div>
        <div class="small muted">Hit points</div>
        <div class="row hp">
          <button onclick={() => adjustHp(-1)} aria-label="Lose 1 HP">−</button>
          <strong>{c.hp}<span class="muted">/{c.sheet.hp()}</span></strong>
          <button onclick={() => adjustHp(1)} aria-label="Heal 1 HP">+</button>
        </div>
      </div>
      <div>
        <label for="armor" class="small muted" style="margin:0">Armor</label>
        <input id="armor" type="number" bind:value={c.data.inventory.armor.rating} onchange={save} />
      </div>
      <div>
        <div class="small muted">Carry</div>
        <strong>{carry.encumbrance} / {carry.capacity}</strong>
      </div>
    </div>
    <XpPanel character={c} />
  </section>

  <h2>Attacks</h2>
  <div class="grid2">
    <button class="stat" use:holdRoll={(d) => check('Melee attack', 20, atk.melee, d, { attack: true })}>
      <span>Melee</span><strong>{atk.melee}+</strong>
    </button>
    <button class="stat" use:holdRoll={(d) => check('Ranged attack', 20, atk.ranged, d, { attack: true })}>
      <span>Ranged</span><strong>{atk.ranged}+</strong>
    </button>
  </div>
  {#each c.data.inventory.weapons as w, wi}
    <div class="weapon">
      <input class="wname" bind:value={w.name} onchange={save} aria-label="Weapon name" />
      <input class="dmg" bind:value={w.damage} onchange={save} aria-label="Damage dice" />
      <select class="rng" bind:value={w.range} onchange={save} aria-label="Melee or ranged">
        <option value="melee">Melee</option><option value="ranged">Ranged</option>
      </select>
      <button use:holdRoll={(d) => check(`${w.name} attack`, 20, w.range === 'melee' ? atk.melee : atk.ranged, d, { attack: true })}>Hit</button>
      <button onclick={() => rollExpr(`${w.name} damage`, w.damage)}>Dmg</button>
      <button class="ghost" aria-label="Remove weapon" onclick={() => { c.data.inventory.weapons.splice(wi, 1); save(); }}>✕</button>
    </div>
  {/each}
  <button class="ghost" onclick={addWeapon}>+ Add weapon</button>

  <h2>Abilities and saves</h2>
  <div class="grid2">
    {#each ABILITIES as a}
      {@const s = saveThreshold(c, a.id)}
      <button class="stat" use:holdRoll={(d) => check(`Save vs. ${a.save}`, 20, s, d)}>
        <span>
          {a.short} {signed(c.abilities[a.id])}{#if c.abilities[a.id] !== c.sheet.ability(a.id)}<small class="muted"> (sheet {signed(c.sheet.ability(a.id))})</small>{/if}
          <br /><small class="muted">vs. {a.save}</small>
        </span>
        <strong>{s}+</strong>
      </button>
    {/each}
  </div>
  <div class="row checks">
    <span class="small muted">Ability check (d6 + ability):</span>
    {#each ABILITIES as a}
      <button class="mini" use:holdRoll={(d) => rollExpr(`${a.name} check${d === 'normal' ? '' : ` (${d})`}`, `${{ easy: '2d6kh1', normal: 'd6', hard: '2d6kl1' }[d]}${c!.abilities[a.id] ? signed(c!.abilities[a.id]) : ''}`)}>{a.short}</button>
    {/each}
  </div>

  <h2>Talents <small class="muted">(d6)</small></h2>
  <!-- One column per ability, like the card. -->
  <div class="talents">
    {#each ABILITIES.filter((a) => TALENTS.some((t) => t.ability === a.id)) as a}
      <div class="tcol">
        <span class="thead">{a.short} {signed(c.abilities[a.id])}</span>
        {#each TALENTS.filter((t) => t.ability === a.id) as t}
          {@const th = talentThreshold(c, t.id)}
          <button class="stat talent" title={t.use} use:holdRoll={(d) => check(t.name, 6, th, d)}>
            <span>{t.name}{hasExpertise(c, t.id) ? '*' : ''}</span><strong>{th}+</strong>
          </button>
        {/each}
      </div>
    {/each}
  </div>
  <p class="small muted">* expertise: easy for this class's specialty (see p. {cls.page}). Hold any roll and slide up for Easy or down for Hard.</p>

  <h2>Class features</h2>
  <ul class="features">
    {#each cls.features.filter((f) => f.level <= c!.level) as f}
      <li><strong>{f.name}.</strong> {f.summary}</li>
    {/each}
  </ul>
  <p class="small muted">Training: {cls.martial}.</p>
  {#if c.sheet.levels().length > 1 || c.sheet.levels()[0]?.training.length}
    <details>
      <summary class="small muted">Level history</summary>
      <ul class="features small">
        {#each c.sheet.levels() as l}
          <li>
            Level {l.level}: {l.level === 1 ? 'started with ' : '+'}{l.hp} HP{l.training.length ? `, trained ${l.training.map((t) => TALENTS.find((x) => x.id === t)!.name).join(', ')}` : ''}{l.feat ? `, ${l.feat}` : ''}
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  <Effects character={c} />

  {#if cls.magic}
    <Magic character={c} />
  {/if}

  <Followers character={c} />

  <h2>Gear</h2>
  <label for="armor-notes">Armor worn</label>
  <input id="armor-notes" bind:value={c.data.inventory.armor.worn} onchange={save} placeholder="e.g. Light armor, threshold 3" />
  <label for="gear">Equipment</label>
  <textarea
    id="gear"
    value={c.data.inventory.items.join('\n')}
    placeholder="One item per line"
    onchange={(e) => { c.data.inventory.items = (e.target as HTMLTextAreaElement).value.split('\n').map((x) => x.trim()).filter(Boolean); save(); }}
  ></textarea>
  <label for="notes">Notes, feats, spells</label>
  <textarea id="notes" bind:value={c.data.notes} onchange={save}></textarea>

  <h2>Manage</h2>
  <div class="row">
    <button class="primary" onclick={() => (app.view = { name: 'render', id: c!.id, mode: 'postcard' })}>Postcard / PDF</button>
    <button onclick={() => (app.view = { name: 'render', id: c!.id, mode: 'page' })}>Full page</button>
    <button onclick={() => downloadJson(`${slug(c!.name)}.json`, c!.data)}>Export JSON</button>
    {#if confirmDelete}
      <button class="primary" onclick={remove}>Really delete</button>
      <button class="ghost" onclick={() => (confirmDelete = false)}>Keep</button>
    {:else}
      <button class="ghost failure" onclick={() => (confirmDelete = true)}>Delete</button>
    {/if}
  </div>
{:else}
  <p>Character not found.</p>
{/if}

<style>
  .ident { display: flex; gap: 0.75rem; align-items: flex-start; }
  .ident .grow { min-width: 0; }
  .portrait {
    width: 84px; height: 84px; padding: 0; flex: none; overflow: hidden;
    border-radius: 12px; border: 1px dashed var(--line); color: var(--muted); font-size: 0.8rem;
    position: relative; display: grid; place-items: center; cursor: pointer;
  }
  .pick { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 0; }
  .portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .clear { min-height: 28px; padding: 0; }
  .name { font-family: Georgia, serif; font-size: 1.5rem; font-weight: 700; border-color: transparent; background: transparent; padding-left: 0; }
  .vitals strong { font-size: 1.3rem; font-family: Georgia, serif; }
  .hp { gap: 0.35rem; flex-wrap: nowrap; }
  .hp button { min-width: 40px; padding: 0.3rem; }
  .stat { display: flex; justify-content: space-between; align-items: center; text-align: left; gap: 0.4rem; }
  .stat strong { font-size: 1.25rem; font-family: Georgia, serif; }
  .talents { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; }
  .tcol { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
  .thead { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); text-align: center; }
  /* Name above threshold so four columns fit a phone. */
  .talent { flex-direction: column; align-items: flex-start; gap: 0; padding: 0.35rem 0.5rem; font-size: 0.85rem; min-width: 0; }
  .talent span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .talent strong { font-size: 1.1rem; }
  .weapon {
    margin-top: 0.5rem; display: grid; gap: 0.3rem;
    grid-template-columns: 4.2rem 1fr auto auto auto;
  }
  .weapon .wname { grid-column: 1 / -1; }
  .weapon input, .weapon select { min-width: 0; }
  .weapon button { padding: 0.3rem 0.6rem; }
  .checks { margin-top: 0.6rem; gap: 0.3rem; }
  .mini { min-height: 36px; padding: 0.2rem 0.55rem; }
  .features { padding-left: 1.1rem; margin: 0; }
  .features li { margin-bottom: 0.35rem; }
</style>
