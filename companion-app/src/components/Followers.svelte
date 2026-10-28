<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { beastFollower, blankFollower, quickFollower, talentThreshold, type Character, type Follower } from '../lib/character';
  import { BESTIARY, levelOf } from '../bestiary/bestiary';
  import { thresholdCheck } from '../lib/checks';
  import { ATTITUDES, loyaltyDifficulty, maxFollowers, type Difficulty } from '../rules/rules';
  import { combine, holdRoll } from '../lib/hold.svelte';

  let { character: c }: { character: Character } = $props();

  let open = $state<string | null>(null);
  // Animals and fey beasts a beast companion can be taken from (the bestiary, pp. 143-150).
  const companions = BESTIARY.companions();

  let followers = $derived(c.data.followers.filter((f) => f.kind === 'follower'));
  let beasts = $derived(c.data.followers.filter((f) => f.kind === 'beast'));
  let limit = $derived(maxFollowers(talentThreshold(c, 'bearing')));
  // Hunters and druids manage beast companions by Survival (Referee's Guide, Managing Followers).
  let beastLimit = $derived(c.classId === 'hunter' || c.classId === 'druid' ? maxFollowers(talentThreshold(c, 'survival')) : null);
  let beastHd = $derived(beasts.reduce((s, b) => s + b.hitDice, 0));
  let disgruntled = $derived(followers.some((f) => f.attitude === 'Hostile' || f.attitude === 'Unfriendly'));
  let overLimit = $derived(followers.length > limit);

  function save() {
    app.persist();
  }

  function harder(d: Difficulty): Difficulty {
    return d === 'easy' ? 'normal' : 'hard';
  }

  // Loyalty sets the difficulty (p. 30). A disgruntled follower or an oversized
  // retinue makes managing the others harder.
  function followerDifficulty(f: Follower): Difficulty {
    let d = loyaltyDifficulty(f.attitude);
    if (f.kind === 'follower' && (overLimit || (disgruntled && f.attitude !== 'Helpful'))) d = harder(d);
    return d;
  }

  // A follower's class comes from its leader's ruleset; one it doesn't know is classless.
  function classOf(f: Follower) {
    return f.classId && c.rules.hasClass(f.classId) ? c.rules.getClass(f.classId) : undefined;
  }

  function followerAttack(f: Follower): number {
    return classOf(f) ? c.rules.attack(f.classId!, f.abilities.str, f.level) : c.rules.throw(f.abilities.str + f.level);
  }

  // Loyalty sets the base difficulty; holding the button adds circumstances on top.
  async function morale(f: Follower, circumstance: Difficulty) {
    await app.record(
      thresholdCheck({ who: `${f.name} (${c.name})`, label: 'Morale (save vs. Fear)', sides: 20, threshold: c.rules.throw(f.abilities.cha + f.level), difficulty: combine(followerDifficulty(f), circumstance) })
    );
  }

  async function attack(f: Follower, difficulty: Difficulty) {
    await app.record(
      thresholdCheck({
        who: `${f.name} (${c.name})`,
        label: 'Melee attack',
        sides: 20,
        threshold: followerAttack(f),
        difficulty,
        improvedCritical: classOf(f)?.improvedCritical ?? false
      })
    );
  }

  async function direct(f: Follower, circumstance: Difficulty) {
    await app.record(
      thresholdCheck({ who: c.name, label: `Direct ${f.name} (Bearing)`, sides: 6, threshold: talentThreshold(c, 'bearing'), difficulty: combine(followerDifficulty(f), circumstance) })
    );
  }

  function add(f: Follower) {
    c.data.followers.push(f);
    open = f.id;
    save();
  }

  // A beast from the bestiary; the picker goes back to its first line after each pick.
  function addBeast(picker: HTMLSelectElement) {
    const m = BESTIARY.get(picker.value);
    if (m) add(beastFollower(m));
    picker.value = '';
  }

  function remove(f: Follower) {
    c.data.followers = c.data.followers.filter((x) => x.id !== f.id);
    save();
  }

  function hp(f: Follower, delta: number) {
    f.hp = Math.max(0, Math.min(f.hpMax, f.hp + delta));
    save();
  }
</script>

<h2>Retinue</h2>
<p class="small muted">
  Followers {followers.length} / {limit} (from Bearing {talentThreshold(c, 'bearing')}+).
  {#if beastLimit !== null}Beast companions {beastHd} / {beastLimit} HD (from Survival).{/if}
</p>
{#if overLimit}<p class="small failure">Over your Bearing limit: managing followers is harder until some leave.</p>{/if}
{#if disgruntled}<p class="small failure">A disgruntled follower makes managing the rest harder.</p>{/if}

{#each c.data.followers as f (f.id)}
  <div class="card follower">
    <button class="head" onclick={() => (open = open === f.id ? null : f.id)}>
      <span class="grow">
        <strong>{f.name}</strong>
        <span class="small muted">{f.kind === 'beast' ? `${f.hitDice} HD beast` : `Lvl ${f.level}`} · HP {f.hp}/{f.hpMax}</span>
      </span>
      <span class="chip">{f.attitude}</span>
    </button>
    <div class="row actions">
      <button onclick={() => hp(f, -1)} aria-label="Lose 1 HP">−HP</button>
      <button onclick={() => hp(f, 1)} aria-label="Heal 1 HP">+HP</button>
      <button use:holdRoll={(d) => attack(f, d)}>Attack {followerAttack(f)}+</button>
      <button use:holdRoll={(d) => morale(f, d)}>Morale</button>
      {#if f.kind === 'follower'}<button use:holdRoll={(d) => direct(f, d)}>Direct</button>{/if}
    </div>
    {#if open === f.id}
      <div class="edit">
        <div class="grid2">
          <div><label for="fn-{f.id}">Name</label><input id="fn-{f.id}" bind:value={f.name} onchange={save} /></div>
          <div>
            <label for="fa-{f.id}">Attitude</label>
            <select id="fa-{f.id}" bind:value={f.attitude} onchange={save}>
              {#each ATTITUDES as a}<option value={a}>{a}</option>{/each}
            </select>
          </div>
          {#if f.kind === 'beast'}
            <div><label for="fh-{f.id}">Hit dice</label><input id="fh-{f.id}" type="number" min="1" bind:value={f.hitDice} onchange={save} /></div>
          {:else}
            <div><label for="fl-{f.id}">Level</label><input id="fl-{f.id}" type="number" min="0" max="10" bind:value={f.level} onchange={save} /></div>
          {/if}
          <div><label for="fm-{f.id}">Max HP</label><input id="fm-{f.id}" type="number" min="1" bind:value={f.hpMax} onchange={save} /></div>
        </div>
        {#if classOf(f)}<p class="small muted">{classOf(f)!.name}; primes at +1.</p>{/if}
        {#if f.traits.length}<p class="small">Traits: {f.traits.join(', ')}</p>{/if}
        {#if f.kind === 'follower'}
          <label for="fw-{f.id}">Pay</label><input id="fw-{f.id}" bind:value={f.wage} onchange={save} />
        {/if}
        <label for="fnotes-{f.id}">Notes</label>
        <textarea id="fnotes-{f.id}" bind:value={f.notes} onchange={save}></textarea>
        <button class="ghost failure" onclick={() => remove(f)}>Dismiss {f.name}</button>
      </div>
    {/if}
  </div>
{/each}

<div class="row">
  <button onclick={() => add(quickFollower(c.rules))}>Roll a follower</button>
  <button onclick={() => add(blankFollower('follower'))}>Add follower</button>
  <select aria-label="Add a beast from the bestiary" onchange={(e) => addBeast(e.currentTarget)}>
    <option value="">Add a beast…</option>
    {#each companions as m (m.ref)}<option value={m.ref}>{m.name} · {levelOf(m)} HD · p. {m.page}</option>{/each}
  </select>
  <button onclick={() => add(blankFollower('beast'))}>Blank beast</button>
</div>
<p class="small muted">Rolled followers use the one-roll NPC table (p. 258). Morale and directing get harder as loyalty drops.</p>

<style>
  .follower { margin-bottom: 0.5rem; padding: 0.6rem; }
  .head { width: 100%; display: flex; align-items: center; gap: 0.5rem; border: 0; background: transparent; padding: 0; text-align: left; min-height: 0; }
  .head .grow { display: flex; flex-direction: column; }
  .actions { margin-top: 0.4rem; gap: 0.3rem; }
  .actions button { min-height: 36px; padding: 0.2rem 0.6rem; font-size: 0.9rem; }
  .edit { margin-top: 0.5rem; border-top: 1px dashed var(--line); }
</style>
