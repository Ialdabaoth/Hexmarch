<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { campaignRulesId } from '../lib/campaign';
  import { loadCreatures, saveCreatures } from '../lib/storage';
  import { thresholdCheck } from '../lib/checks';
  import { combine, holdRoll } from '../lib/hold.svelte';
  import { wikiForMonster } from '../lib/wiki';
  import { ATTITUDES, TALENTS, findRules, rulesFor, type Difficulty } from '../rules/rules';
  import { BESTIARY } from '../bestiary/bestiary';
  import {
    SAVE_KINDS, TemplateError, creatureFollower, damageRollEntry, newCreature, reactionEntry, rollNpcSheet, saveTarget, sheetStats,
    type Attack, type Creature, type CreatureKind, type TemplateSources
  } from '../bestiary/creature';
  import PageRef from './PageRef.svelte';

  // The referee's creatures for the active campaign (CREATURES_FORMAT.md): monsters, NPCs
  // and beasts built from a template, each a copy with its own hit points per member.
  let list = $state<Creature[]>([]);
  let loadedFor = $state<string | null>(null);
  let open = $state<string | null>(null);
  let filter = $state<'all' | CreatureKind>('all');
  let pick = $state('');
  let count = $state(1);

  const monsters = BESTIARY.list().slice().sort((a, b) => a.name.localeCompare(b.name));

  $effect(() => {
    const key = app.campaignId;
    if (loadedFor === key) return;
    loadCreatures(key).then((l) => {
      list = l;
      loadedFor = key;
    });
  });

  let rules = $derived(findRules(app.campaign ? campaignRulesId(app.campaign) : app.settings.rules) ?? rulesFor('mm'));
  let shown = $derived(list.filter((c) => filter === 'all' || c.kind === filter));

  function save() {
    if (loadedFor !== null) saveCreatures(loadedFor, $state.snapshot(list) as Creature[]).catch((e) => console.warn('Could not save', e));
  }

  // Full-sheet NPCs are characters the referee owns; their sheets live with the others.
  const sheetOf = (c: Creature) => (c.template.from === 'pc' ? app.characters.find((x) => x.id === c.template.sheet) : undefined);

  function sources(): TemplateSources {
    return {
      bestiary: (ref) => BESTIARY.get(ref),
      rules,
      sheet: (id) => {
        const ch = app.characters.find((x) => x.id === id);
        return ch ? sheetStats(ch) : undefined;
      }
    };
  }

  function add(from: string, sheet?: string) {
    try {
      const c = newCreature({ from, ...(sheet ? { sheet } : {}) }, sheet ? 1 : count, sources());
      list.push(c);
      open = c.id;
      save();
    } catch (e) {
      app.notify(e instanceof TemplateError ? e.message : `Couldn't add: ${(e as Error).message}`);
    }
    pick = '';
  }

  function remove(c: Creature) {
    const sheet = sheetOf(c);
    if (sheet && !confirm(`Remove ${c.name} and their character sheet?`)) return;
    list = list.filter((x) => x.id !== c.id);
    save();
    if (sheet) app.remove(sheet.id);
  }

  // A full NPC: a level 1 character sheet from the quick NPC table, owned by the referee.
  async function rollFullNpc() {
    const sheet = rollNpcSheet(rules, app.campaignId);
    await app.add(sheet);
    add('pc', sheet.id);
  }

  // A copy of a character's sheet, run by the referee (the character stays as it was).
  async function copyCharacter(select: HTMLSelectElement) {
    const ch = app.characters.find((x) => x.id === select.value);
    select.value = '';
    if (!ch) return;
    const copy = { ...$state.snapshot(ch.data), id: crypto.randomUUID(), owner: 'referee' as const, followers: [] };
    await app.add(copy);
    add('pc', copy.id);
  }

  function openSheet(c: Creature) {
    const sheet = sheetOf(c);
    if (!sheet) return app.notify(`${c.name}'s sheet isn't on this device`);
    app.updateSettings({ activeId: sheet.id });
    app.view = { name: 'list' };
  }

  // The NPC joins the party: a full-sheet NPC becomes a player character; anyone else
  // joins a character's retinue as a follower or beast companion (one member of a troupe).
  async function joinParty(c: Creature, target: string) {
    if (!target) return;
    const sheet = sheetOf(c);
    if (sheet) {
      const i = app.sheets.findIndex((x) => x.id === sheet.id);
      if (i >= 0) delete app.sheets[i].owner;
      await app.persist();
      list = list.filter((x) => x.id !== c.id);
      save();
      app.notify(`${c.name} joined the party`);
      return;
    }
    const ch = app.characters.find((x) => x.id === target);
    if (!ch) return;
    const many = c.hp.length > 1;
    ch.data.followers.push(creatureFollower(c, 0));
    if (many) {
      c.hp.splice(0, 1);
      c.hpMax.splice(0, 1);
    } else {
      list = list.filter((x) => x.id !== c.id);
    }
    await app.persist();
    save();
    app.notify(`${many ? `One ${c.name}` : c.name} joined ${ch.name}'s retinue`);
  }

  function hp(c: Creature, i: number, delta: number) {
    c.hp[i] = Math.max(0, Math.min(c.hpMax[i], c.hp[i] + delta));
    save();
  }

  function addMember(c: Creature) {
    c.hpMax.push(c.hpMax[0] ?? 1);
    c.hp.push(c.hpMax[0] ?? 1);
    save();
  }

  function removeMember(c: Creature, i: number) {
    if (c.hp.length <= 1) return;
    c.hp.splice(i, 1);
    c.hpMax.splice(i, 1);
    save();
  }

  const lvl = (c: Creature) => Math.floor(c.stats.level);
  const attackAt = (c: Creature) => rules.throw(c.stats.abilities.str + lvl(c));
  const talentAt = (c: Creature) => c.stats.talentThreshold ?? rules.npcTalentThreshold(lvl(c));
  const talentName = (id: string) => TALENTS.find((t) => t.id === id)?.name ?? id;
  const levelText = (l: number) => (l === 0.5 ? '½' : String(l));

  async function attack(c: Creature, a: Attack, d: Difficulty) {
    await app.record(thresholdCheck({ who: c.name, label: `${a.name} attack`, sides: 20, threshold: attackAt(c), difficulty: d }));
  }

  async function damage(c: Creature, a: Attack) {
    try {
      await app.record(damageRollEntry(c.name, a));
    } catch (e) {
      app.notify(`Can't roll "${a.damage}": ${(e as Error).message}`);
    }
  }

  async function saveRoll(c: Creature, kind: (typeof SAVE_KINDS)[number], d: Difficulty) {
    await app.record(thresholdCheck({ who: c.name, label: `Save vs. ${kind[0].toUpperCase()}${kind.slice(1)}`, sides: 20, threshold: saveTarget(c.stats, kind, rules)!, difficulty: d }));
  }

  async function talent(c: Creature, id: string, d: Difficulty) {
    await app.record(thresholdCheck({ who: c.name, label: talentName(id), sides: 6, threshold: talentAt(c), difficulty: combine('normal', d) }));
  }

  async function reaction(c: Creature) {
    await app.record(reactionEntry(c.name, c.stats.behavior!));
  }

  function addTalent(c: Creature, select: HTMLSelectElement) {
    if (select.value && !c.stats.talents.includes(select.value)) c.stats.talents.push(select.value);
    select.value = '';
    save();
  }

  function removeTalent(c: Creature, id: string) {
    c.stats.talents = c.stats.talents.filter((t) => t !== id);
    save();
  }

  function setThreshold(c: Creature, value: string) {
    const n = Number(value);
    if (value === '' || !Number.isFinite(n)) delete c.stats.talentThreshold;
    else c.stats.talentThreshold = Math.max(2, Math.min(6, Math.round(n)));
    save();
  }
</script>

<p class="small muted">Monsters, NPCs and beasts you run, for {app.campaign ? app.campaign.campaign.name : 'this device'} ({rules.name}). Each is a copy of its bestiary entry, so changing it here never changes the book.</p>

<div class="row add">
  <select aria-label="Monster from the bestiary" bind:value={pick} class="grow">
    <option value="">Add from the bestiary…</option>
    <optgroup label="NPCs ({rules.name})">
      <option value="npc">Quick NPC (rolled)</option>
      {#each rules.classes as cl (cl.id)}<option value="npc:{cl.id}">NPC: {cl.name}</option>{/each}
    </optgroup>
    <optgroup label="Bestiary">
      {#each monsters as m (m.ref)}<option value={m.ref}>{m.name}{m.page ? ` · p. ${m.page}` : ''}</option>{/each}
    </optgroup>
  </select>
  <label class="count">× <input type="number" min="1" max="99" bind:value={count} aria-label="How many" /></label>
  <button disabled={!pick} onclick={() => add(pick)}>Add</button>
  <button class="ghost" onclick={() => add('blank')}>Blank</button>
</div>
<div class="row add">
  <button class="ghost" onclick={rollFullNpc}>Roll a full NPC sheet</button>
  {#if app.party.length}
    <select aria-label="Copy a character as an NPC" onchange={(e) => copyCharacter(e.currentTarget)}>
      <option value="">Copy a character as an NPC…</option>
      {#each app.party as ch (ch.id)}<option value={ch.id}>{ch.name}</option>{/each}
    </select>
  {/if}
</div>

{#if list.length}
  <div class="row filter">
    {#each ['all', 'monster', 'npc', 'beast'] as k}
      <button class="chip" class:on={filter === k} onclick={() => (filter = k as typeof filter)}>{k === 'all' ? 'All' : k === 'npc' ? 'NPCs' : `${k[0].toUpperCase()}${k.slice(1)}s`}</button>
    {/each}
  </div>
{/if}

{#each shown as c (c.id)}
  {@const sheet = sheetOf(c)}
  {#if c.template.from === 'pc'}
  <div class="card creature">
    <div class="head">
      <span class="grow">
        <strong>{sheet?.name ?? c.name}</strong>
        <span class="small muted">{sheet ? sheetStats(sheet).summary : 'Sheet not on this device'} · full sheet</span>
      </span>
      <span class="chip">{c.attitude}</span>
    </div>
    {#if sheet}<div class="members"><span class="member"><span>HP {sheet.hp}/{sheet.hpMax}</span></span></div>{/if}
    <div class="row actions">
      <button onclick={() => openSheet(c)}>Open sheet</button>
      <button class="ghost" onclick={() => joinParty(c, 'party')}>Join the party</button>
      <button class="ghost failure" onclick={() => remove(c)}>Remove</button>
    </div>
  </div>
  {:else}
  <div class="card creature">
    <button class="head" onclick={() => (open = open === c.id ? null : c.id)} aria-expanded={open === c.id}>
      <span class="grow">
        <strong>{c.name}{c.hp.length > 1 ? ` ×${c.hp.length}` : ''}</strong>
        <span class="small muted">Level {levelText(c.stats.level)} · Armor {c.stats.armor} · {c.stats.movement}</span>
      </span>
      <span class="chip">{c.attitude}</span>
    </button>

    <div class="members">
      {#each c.hp as h, i}
        <span class="member" class:down={h === 0}>
          {#if c.hp.length > 1}<span class="small muted">#{i + 1}</span>{/if}
          <span>HP {h}/{c.hpMax[i]}</span>
          <button onclick={() => hp(c, i, -1)} aria-label="{c.name} {i + 1} loses 1 HP">−</button>
          <button onclick={() => hp(c, i, 1)} aria-label="{c.name} {i + 1} heals 1 HP">+</button>
        </span>
      {/each}
    </div>

    <div class="row actions">
      {#each c.stats.attacks as a}
        <button use:holdRoll={(d) => attack(c, a, d)}>{a.name} {attackAt(c)}+</button>
        {#if a.damage}<button class="ghost" onclick={() => damage(c, a)} title={a.note} aria-label="{a.name} damage {a.damage}">dmg {a.damage}</button>{/if}
      {/each}
      {#if c.stats.behavior}<button class="ghost" onclick={() => reaction(c)}>Reaction</button>{/if}
    </div>
    {#if SAVE_KINDS.some((k) => saveTarget(c.stats, k, rules) !== undefined)}
      <div class="row actions">
        {#each SAVE_KINDS as k}
          {@const t = saveTarget(c.stats, k, rules)}
          {#if t !== undefined}<button class="save" use:holdRoll={(d) => saveRoll(c, k, d)}>{k[0].toUpperCase()}{k.slice(1)} {t}+</button>{/if}
        {/each}
      </div>
    {/if}
    {#if c.stats.talents.length}
      <div class="row actions">
        {#each c.stats.talents as t}<button use:holdRoll={(d) => talent(c, t, d)}>{talentName(t)} {talentAt(c)}+</button>{/each}
      </div>
    {/if}

    {#if open === c.id}
      <div class="edit">
        {#if c.stats.summary}<p class="small">{c.stats.summary}</p>{/if}
        {#each c.stats.special as s}<p class="small">{s}</p>{/each}
        {#if c.stats.behavior}<p class="small muted">Reaction (d6): {c.stats.behavior}</p>{/if}
        {#if c.stats.ref}<p class="small muted">From {c.stats.ref} · <PageRef page={c.stats.page} href={wikiForMonster(c.stats.ref)} /></p>{/if}
        <div class="grid2">
          <div><label for="cn-{c.id}">Name</label><input id="cn-{c.id}" bind:value={c.name} onchange={save} /></div>
          <div>
            <label for="ca-{c.id}">Attitude</label>
            <select id="ca-{c.id}" bind:value={c.attitude} onchange={save}>
              {#each ATTITUDES as a}<option value={a}>{a}</option>{/each}
            </select>
          </div>
          <div>
            <label for="ck-{c.id}">Kind</label>
            <select id="ck-{c.id}" bind:value={c.kind} onchange={save}>
              <option value="monster">Monster</option><option value="npc">NPC</option><option value="beast">Beast</option>
            </select>
          </div>
          <div>
            <label for="ct-{c.id}">Talent threshold</label>
            <input id="ct-{c.id}" type="number" min="2" max="6" placeholder="{rules.npcTalentThreshold(lvl(c))} (NPC table)" value={c.stats.talentThreshold ?? ''} onchange={(e) => setThreshold(c, e.currentTarget.value)} />
          </div>
        </div>
        <div class="row chips">
          {#each c.stats.talents as t}<button class="chip" onclick={() => removeTalent(c, t)} aria-label="Remove {talentName(t)}">{talentName(t)} ×</button>{/each}
          <select aria-label="Add a talent" onchange={(e) => addTalent(c, e.currentTarget)}>
            <option value="">Add a talent…</option>
            {#each TALENTS.filter((t) => !c.stats.talents.includes(t.id)) as t}<option value={t.id}>{t.name}</option>{/each}
          </select>
        </div>
        <label for="cnotes-{c.id}">Notes</label>
        <textarea id="cnotes-{c.id}" bind:value={c.notes} onchange={save}></textarea>
        {#if app.party.length}
          <select aria-label="Join a character's retinue" onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; joinParty(c, v); }}>
            <option value="">Join a retinue{c.hp.length > 1 ? ' (one of them)' : ''}…</option>
            {#each app.party as ch (ch.id)}<option value={ch.id}>{ch.name}'s {c.kind === 'beast' ? 'beasts' : 'followers'}</option>{/each}
          </select>
        {/if}
        <div class="row">
          <button class="ghost" onclick={() => addMember(c)}>Add one more</button>
          {#if c.hp.length > 1}<button class="ghost" onclick={() => removeMember(c, c.hp.length - 1)}>One fewer</button>{/if}
          <button class="ghost failure" onclick={() => remove(c)}>Remove {c.name}</button>
        </div>
      </div>
    {/if}
  </div>
  {/if}
{:else}
  {#if list.length}<p class="small muted">None of that kind.</p>{:else}<p class="small muted">No creatures yet. Add one from the bestiary.</p>{/if}
{/each}

<style>
  .add { align-items: center; gap: 0.4rem; }
  .count { display: flex; align-items: center; gap: 0.25rem; margin: 0; }
  .count input { width: 4rem; }
  .filter { gap: 0.3rem; margin: 0.4rem 0; }
  .chip.on { background: var(--accent); color: var(--bg, #fff); }
  .creature { margin-bottom: 0.5rem; padding: 0.6rem; }
  .head { width: 100%; display: flex; align-items: center; gap: 0.5rem; border: 0; background: transparent; padding: 0; text-align: left; min-height: 0; }
  .head .grow { display: flex; flex-direction: column; }
  .members { display: flex; flex-wrap: wrap; gap: 0.3rem 0.8rem; margin-top: 0.35rem; }
  .member { display: inline-flex; align-items: center; gap: 0.3rem; }
  .member.down span { text-decoration: line-through; color: var(--muted); }
  .member button { min-height: 30px; min-width: 30px; padding: 0 0.4rem; }
  .actions { margin-top: 0.35rem; gap: 0.3rem; }
  .actions button { min-height: 34px; padding: 0.2rem 0.55rem; font-size: 0.9rem; }
  .actions .ghost { border: 1px dashed var(--line); }
  .add select { min-width: 10rem; }
  .edit { margin-top: 0.5rem; border-top: 1px dashed var(--line); }
  .chips { gap: 0.3rem; margin: 0.4rem 0; align-items: center; }
</style>
