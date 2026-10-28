<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { hitDieLabel, xpToNext, type Character } from '../lib/character';
  import { levelUp } from '../lib/sheet';
  import { TALENTS, hasKind, scheduledTraining, type TalentId } from '../rules/rules';

  // XP tally and the level-up steps, shared by the full sheet and the postcard's XP editor.
  let { character: c, onleveled }: { character: Character; onleveled?: () => void } = $props();

  let cls = $derived(c.rules.getClass(c.classId));
  let toNext = $derived(xpToNext(c));
  let leveling = $state(false);
  let levelTraining = $state<TalentId | undefined>(undefined);
  let levelFeat = $state('');
  // A fighter can't take a feat they already have.
  let ownedFeats = $derived(new Set(c.data.class.levelups.map((l) => l.feat?.trim().toLowerCase()).filter(Boolean)));
  let freeFeats = $derived((cls.feats ?? []).filter((f) => !ownedFeats.has(f.toLowerCase())));
  let featTaken = $derived(hasKind(cls, 'fighter') && ownedFeats.has(levelFeat.trim().toLowerCase()));

  function addXp(delta: number) {
    c.data.class.xp = Math.max(0, c.data.class.xp + delta);
    app.persist();
  }

  function doLevelUp() {
    const entry = levelUp(c.data, { training: levelTraining, feat: levelFeat });
    app.persist();
    const trained = TALENTS.find((t) => entry[t.id] === 1);
    app.notify(`Level ${entry.level}! +${entry.hp} HP${trained ? `, trained ${trained.name}` : ''}`);
    leveling = false;
    levelTraining = undefined;
    levelFeat = '';
    onleveled?.();
  }
</script>

<div class="row xp">
  <span class="small muted">XP</span>
  <button onclick={() => addXp(-1)} aria-label="Remove experience">−</button>
  <strong>{c.xp} / {toNext}</strong>
  <button onclick={() => addXp(1)} aria-label="Add experience">+</button>
  {#if c.xp >= toNext && c.level < 10 && !leveling}
    <button class="primary" onclick={() => (leveling = true)}>Level up</button>
  {/if}
</div>
{#if leveling}
  <div class="levelup">
    <p class="small">Level {c.level + 1}: {c.rules.mechanics.attackProgression === 'all' || hasKind(cls, 'fighter') ? 'every throw drops' : 'saving throws drop'} by 1 and you roll a hit die ({hitDieLabel(c)}) for more HP.</p>
    {#if hasKind(cls, 'expert')}
      <select bind:value={levelTraining}>
        <option value={undefined}>Talent to train…</option>
        {#each c.rules.trainableAt(cls, c.level + 1) as t}<option value={t}>{TALENTS.find((x) => x.id === t)!.name}</option>{/each}
      </select>
    {/if}
    {#if scheduledTraining(cls, c.level + 1).length}
      <p class="small">Trains {[...new Set(scheduledTraining(cls, c.level + 1))].map((t) => {
        const times = scheduledTraining(cls, c.level + 1).filter((x) => x === t).length;
        return `${TALENTS.find((x) => x.id === t)!.name}${times > 1 ? ' twice' : ''}`;
      }).join(' and ')}.</p>
    {/if}
    {#if hasKind(cls, 'fighter') && (c.level + 1) % 2 === 0}
      <input bind:value={levelFeat} list="fighter-feats" placeholder="Fighter feat chosen" aria-label="Fighter feat" />
      {#if cls.feats}<datalist id="fighter-feats">{#each freeFeats as f}<option value={f}></option>{/each}</datalist>{/if}
      {#if featTaken}<p class="small failure">You already have {levelFeat.trim()}.</p>{/if}
    {:else}
      <input bind:value={levelFeat} placeholder="Other choice to note (optional)" aria-label="Level-up note" />
    {/if}
    <div class="row">
      <button class="primary" disabled={(hasKind(cls, 'expert') && !levelTraining) || featTaken} onclick={doLevelUp}>Roll HP and level up</button>
      <button class="ghost" onclick={() => (leveling = false)}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .xp { margin-top: 0.6rem; }
  .xp button:not(.primary) { min-width: 40px; padding: 0.3rem; }
  .levelup { margin-top: 0.6rem; border-top: 1px dashed var(--line); padding-top: 0.6rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .levelup p { margin: 0; }
</style>
