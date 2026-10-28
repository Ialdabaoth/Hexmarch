<script lang="ts">
  import { BESTIARY, levelOf, type MonsterKind, type SaveKind, type WithRef, type Monster } from '../bestiary/bestiary';

  // The printed stat blocks, searchable by name and kind (Bestiary, pp. 143-186).
  const KINDS: MonsterKind[] = ['animal', 'fey beast', 'monster', 'fair folk', 'dragon', 'undead', 'infernal', 'qlippothic', 'huge', 'mortal'];
  const SAVES: SaveKind[] = ['doom', 'hold', 'blast', 'trick', 'curse', 'fear'];

  let query = $state('');
  let kind = $state('all');
  let open = $state<string | null>(null);

  let shown = $derived(
    BESTIARY.list().filter((m) => (kind === 'all' || m.kind === kind) && m.name.toLowerCase().includes(query.trim().toLowerCase()))
  );

  function levelText(m: WithRef<Monster>): string {
    const l = m.level;
    if (l === undefined) return '';
    if (Array.isArray(l)) return `Level ${l[0]} to ${l[1]}`;
    return `Level ${l === 0.5 ? '½' : l}`;
  }

  function saves(m: WithRef<Monster>): string {
    return SAVES.filter((s) => m.saves?.[s] !== undefined).map((s) => `${s} ${m.saves?.[s]}+`).join(', ');
  }
</script>

<h2>Bestiary</h2>
<div class="row">
  <input class="grow" type="search" bind:value={query} placeholder="Find a monster" aria-label="Find a monster" autocomplete="off" />
  <select bind:value={kind} aria-label="Kind">
    <option value="all">All kinds</option>
    {#each KINDS as k}<option value={k}>{k}</option>{/each}
  </select>
</div>

{#each shown as m (m.ref)}
  <div class="card monster">
    <button class="head" onclick={() => (open = open === m.ref ? null : m.ref)} aria-expanded={open === m.ref}>
      <span class="grow">
        <strong>{m.name}</strong>
        <span class="small muted">{levelText(m)} · {m.size} · p. {m.page}</span>
      </span>
    </button>
    <p class="small">{m.summary}</p>
    {#if open === m.ref}
      <dl>
        <dt>Movement</dt><dd>{m.movement}</dd>
        <dt>Armor</dt><dd>{m.armor}</dd>
        <dt>HP</dt><dd>{m.hp}</dd>
        <dt>Attacks</dt><dd>{m.attacks}</dd>
        {#if m.saves}<dt>Saves</dt><dd>{saves(m)}</dd>{/if}
        {#if m.abilities}<dt>Abilities</dt><dd>{m.abilities}</dd>{/if}
        {#if m.feat}<dt>Feats</dt><dd>{m.feat}</dd>{/if}
        <dt>Book</dt><dd>Bestiary p. {m.page}</dd>
      </dl>
    {/if}
  </div>
{:else}
  <p class="small muted">No monsters match.</p>
{/each}

<style>
  .head { width: 100%; display: flex; align-items: center; border: 0; background: transparent; padding: 0; text-align: left; min-height: 0; }
  .head .grow { display: flex; flex-direction: column; }
  .monster { margin-bottom: 0.5rem; padding: 0.6rem; }
  .monster p { margin: 0.3rem 0 0; }
  dl { display: grid; grid-template-columns: 6rem 1fr; gap: 0.25rem 0.6rem; margin: 0.5rem 0 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
</style>
