<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { createSheet } from '../lib/sheet';
  import {
    defaultTalents, rollAbilities, rollOrigin, talentSpreadValid, zeroAbilities,
    type Abilities
  } from '../lib/character';
  import {
    ABILITIES, ABILITY_LABELS, DEFAULT_RULES, RULESETS, TALENTS, hasKind, primesOf, rulesFor,
    type OriginRollStep,
    type AbilityId, type ClassId, type OriginId, type TalentId
  } from '../rules/rules';

  const startRules = rulesFor(app.settings.rules ?? DEFAULT_RULES);
  let rulesId = $state(startRules.id);
  let rules = $derived(rulesFor(rulesId));
  let name = $state('');
  let origin = $state<OriginId>(startRules.origins[0].id);
  let originSteps = $state<OriginRollStep[]>([]);
  let abilities = $state<Abilities>(zeroAbilities());
  let rolls = $state<Partial<Record<AbilityId, number[]>>>({});
  let rolled = $state(false);
  let manual = $state(false);
  let talentBase = $state<Record<TalentId, number>>(defaultTalents(zeroAbilities()));
  let classId = $state<ClassId>(startRules.origins[0].classes[0]);
  let firstTraining = $state<TalentId | undefined>(undefined);
  let swapA = $state<AbilityId>('con');
  let swapB = $state<AbilityId>('str');
  let swapped = $state(false);

  let o = $derived(rules.getOrigin(origin));
  let cls = $derived(rules.getClass(classId));
  let ready = $derived((rolled || manual) && talentSpreadValid(abilities, talentBase) && (!hasKind(cls, 'expert') || !!firstTraining));

  // Switching rules starts the character over: origins and classes differ.
  function pickRules(id: string) {
    rulesId = id;
    app.updateSettings({ rules: id });
    originSteps = [];
    abilities = zeroAbilities();
    talentBase = defaultTalents(abilities);
    rolls = {};
    manual = false;
    firstTraining = undefined;
    classId = rulesFor(id).origins[0].classes[0];
    pickOrigin(rulesFor(id).origins[0].id);
  }

  function pickOrigin(id: OriginId) {
    origin = id;
    if (!rules.getOrigin(id).classes.includes(classId)) classId = rules.getOrigin(id).classes[0];
    rolled = false;
    swapped = false;
  }

  function doRollOrigin() {
    const r = rollOrigin(rules);
    pickOrigin(r.origin);
    originSteps = r.steps;
  }

  function doRollAbilities() {
    const r = rollAbilities(o);
    abilities = r.abilities;
    rolls = r.rolls;
    talentBase = defaultTalents(abilities);
    rolled = true;
    manual = false;
    swapped = false;
  }

  function setManual(id: AbilityId, v: number) {
    abilities[id] = Math.max(-3, Math.min(3, Math.round(v) || 0));
    talentBase = defaultTalents(abilities);
  }

  // Optional rule (p. 8, E9 p. 2): humans may swap one pair of abilities.
  function swap() {
    if (swapA === swapB) return;
    [abilities[swapA], abilities[swapB]] = [abilities[swapB], abilities[swapA]];
    [rolls[swapA], rolls[swapB]] = [rolls[swapB], rolls[swapA]];
    talentBase = defaultTalents(abilities);
    swapped = true;
  }

  // Each ability shifts min(3, |score|) of its three talents. At 0 or ±3 there's nothing
  // to choose; at ±1 or ±2 one talent differs from the other two, and tapping a talent
  // makes it that odd one out.
  function oddChoice(ability: AbilityId): boolean {
    const n = Math.abs(abilities[ability]);
    return n === 1 || n === 2;
  }

  function oddValues(ability: AbilityId): [odd: number, rest: number] {
    const v = abilities[ability];
    const target = v > 0 ? 4 : 6;
    return Math.abs(v) === 1 ? [target, 5] : [5, target];
  }

  function setOdd(ability: AbilityId, id: string) {
    if (!oddChoice(ability)) return;
    const [odd, rest] = oddValues(ability);
    for (const x of TALENTS.filter((x) => x.ability === ability)) talentBase[x.id] = x.id === id ? odd : rest;
  }

  function used(id: AbilityId): string {
    const r = rolls[id];
    if (!r) return '';
    const sorted = [...r].sort((a, b) => a - b);
    if (r.length === 4) {
      const enhanced = o.enhanced.includes(id);
      return `${r.join(' ')} (drop ${enhanced ? sorted[0] : sorted[3]})`;
    }
    return r.join(' ');
  }

  async function create() {
    const sheet = createSheet({ rules: rulesId, name, origin, classId, abilities, talentBase, firstTraining });
    await app.add(sheet);
    app.view = { name: 'sheet', id: sheet.id };
  }
</script>

<div class="row">
  <button class="ghost" onclick={() => (app.view = { name: 'list' })}>‹ Back</button>
  <h1 class="grow">New character</h1>
</div>

<div class="stack">
  <section class="card">
    <h3>Rules</h3>
    <div class="seg" role="group" aria-label="Rules">
      {#each RULESETS as r}
        <button class:on={rulesId === r.id} onclick={() => pickRules(r.id)}>{r.name}</button>
      {/each}
    </div>
  </section>

  <section class="card">
    <h3>1. Origin</h3>
    <div class="row">
      <select class="grow" value={origin} onchange={(e) => pickOrigin((e.target as HTMLSelectElement).value as OriginId)}>
        {#each rules.origins as x}<option value={x.id}>{x.name}</option>{/each}
      </select>
      <button onclick={doRollOrigin}>Roll {rules.originRoll.tables[rules.originRoll.start].die}</button>
    </div>
    <p class="small muted">
      {#if originSteps.length}Rolled {originSteps.map((s) => `${s.table} ${s.roll}`).join(', ')}: {o.name}. {/if}
      {#if o.enhanced.length}Enhanced: {o.enhanced.map((a) => ABILITIES.find((x) => x.id === a)!.short).join(', ')}. Deficient: {o.deficient.map((a) => ABILITIES.find((x) => x.id === a)!.short).join(', ')}.{:else}No adjusted abilities.{/if}
      Height {o.height} in. {o.note ?? ''}
    </p>
  </section>

  <section class="card">
    <div class="row">
      <h3 class="grow">2. Abilities</h3>
      <button class="primary" onclick={doRollAbilities}>{rolled ? 'Reroll' : 'Roll in order'}</button>
    </div>
    <label class="check small"><input type="checkbox" bind:checked={manual} /> Enter scores by hand (for an existing character)</label>
    <div class="abilities">
      {#each ABILITIES as a}
        <div class="ab">
          <div class="small muted">{a.short}{o.enhanced.includes(a.id) ? ' [+]' : o.deficient.includes(a.id) ? ' [−]' : ''}</div>
          {#if manual}
            <input type="number" min="-3" max="3" value={abilities[a.id]} oninput={(e) => setManual(a.id, +(e.target as HTMLInputElement).value)} />
          {:else}
            <div class="score">{rolled ? (abilities[a.id] > 0 ? '+' : '') + abilities[a.id] : '—'}</div>
            {#if rolled}<div class="tiny muted">{used(a.id)}</div>{/if}
          {/if}
          {#if rolled || manual}<div class="tiny muted">{ABILITY_LABELS[abilities[a.id]]}</div>{/if}
        </div>
      {/each}
    </div>
    {#if rolled && (origin === 'human' || origin === 'barbarian')}
      <details>
        <summary class="small muted">Swap one pair (if your referee allows it)</summary>
        <div class="row">
          <select class="grow" bind:value={swapA} disabled={swapped}>{#each ABILITIES as a}<option value={a.id}>{a.short}</option>{/each}</select>
          <select class="grow" bind:value={swapB} disabled={swapped}>{#each ABILITIES as a}<option value={a.id}>{a.short}</option>{/each}</select>
          <button onclick={swap} disabled={swapped || swapA === swapB}>Swap</button>
        </div>
      </details>
    {/if}
  </section>

  {#if rolled || manual}
    <section class="card">
      <h3>3. Talents</h3>
      <p class="small muted">Each point above or below +0 moves one linked talent to 4+ or 6+. At ±1 or ±2 one talent is the odd one out: tap a talent to make it the odd one out.</p>
      {#each ABILITIES.filter((a) => TALENTS.some((t) => t.ability === a.id)) as a}
        {@const v = abilities[a.id]}
        {@const choose = oddChoice(a.id)}
        <div class="talentrow" role="group" aria-label="{a.name} talents">
          <span class="small muted">{a.short} {v > 0 ? '+' : ''}{v}</span>
          {#each TALENTS.filter((t) => t.ability === a.id) as t}
            {@const odd = choose && talentBase[t.id] === oddValues(a.id)[0]}
            <button class="tal" class:moved={talentBase[t.id] !== 5} class:odd disabled={!choose} aria-pressed={choose ? odd : undefined}
              onclick={() => setOdd(a.id, t.id)}>{t.name} <b>{talentBase[t.id]}+</b></button>
          {/each}
        </div>
      {/each}
      {#if !talentSpreadValid(abilities, talentBase)}<p class="small failure">Pick the right number of talents for each ability.</p>{/if}
    </section>

    <section class="card">
      <h3>4. Class</h3>
      <select bind:value={classId}>
        {#each o.classes.map((id) => rules.getClass(id)) as c}
          <option value={c.id}>{c.name} ({(c.parts ?? [c]).map((p) => p.kind).join(' + ')}, prime {primesOf(c).map((p) => ABILITIES.find((a) => a.id === p)!.short).join('/')})</option>
        {/each}
      </select>
      <p class="small muted">
        Hit die {rules.hitDieLabel(classId, abilities.con)}, starting HP {rules.startingHp(classId, abilities.con)}.
        {cls.martial ? `${cls.martial}.` : ''} See {cls.book ?? rules.name} p. {cls.page}.
      </p>
      {#if hasKind(cls, 'expert')}
        <label for="first-training">Level 1 talent training</label>
        <select id="first-training" bind:value={firstTraining}>
          <option value={undefined}>Choose…</option>
          {#each rules.trainableAt(cls, 1) as t}<option value={t}>{TALENTS.find((x) => x.id === t)!.name}</option>{/each}
        </select>
      {/if}
    </section>

    <section class="card">
      <h3>5. Name</h3>
      <input placeholder="Character name" bind:value={name} />
      <p class="small muted">Starting gear: {cls.gear}. You can edit it on the sheet.</p>
      <button class="primary" style="width:100%" disabled={!ready} onclick={create}>Create character</button>
    </section>
  {/if}
</div>

<style>
  .abilities { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 0.5rem; }
  .ab { border: 1px solid var(--line); border-radius: 8px; padding: 0.4rem; text-align: center; }
  .score { font-size: 1.4rem; font-family: Georgia, serif; font-weight: 700; }
  .tiny { font-size: 0.72rem; }
  .talentrow { display: flex; gap: 0.35rem; align-items: stretch; margin: 0.4rem 0; }
  .talentrow > span { width: 3.2rem; flex: none; align-self: center; }
  .tal { flex: 1; min-width: 0; min-height: 44px; padding: 0.25rem 0.3rem; font-size: 0.85rem; line-height: 1.2; color: var(--muted); }
  .tal b { display: block; font-size: 0.95rem; }
  .tal:disabled { opacity: 1; background: transparent; border-color: transparent; }
  .tal.moved { color: var(--accent); }
  .tal.odd { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); font-weight: 600; }
  details { margin-top: 0.6rem; }
  .seg { display: flex; }
  .seg button { flex: 1; border-radius: 0; min-height: 40px; }
  .seg button:first-child { border-radius: 10px 0 0 10px; }
  .seg button:last-child { border-radius: 0 10px 10px 0; }
  .seg button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
</style>
