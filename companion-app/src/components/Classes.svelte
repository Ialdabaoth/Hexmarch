<script lang="ts">
  import type { Ruleset } from '../rules/rules';

  // The chosen rules' classes, with their features by level and book pages.
  let { rules }: { rules: Ruleset } = $props();
  let open = $state<string | null>(null);
</script>

<details class="section">
  <summary><h2>Classes</h2></summary>
  {#each rules.classes as c (c.id)}
    <div class="card cls">
      <button class="head" onclick={() => (open = open === c.id ? null : c.id)} aria-expanded={open === c.id}>
        <strong class="grow">{c.name}</strong>
        <span class="small muted">{c.kind.replace('-', ' ')} · p. {c.page}</span>
      </button>
      {#if open === c.id}
        <ul class="features">
          {#each c.features as f}
            <li><strong>{f.name}</strong> <span class="small muted">level {f.level}</span><div class="small">{f.summary}</div></li>
          {/each}
        </ul>
        {#if c.gear}<p class="small"><span class="muted">Starting gear:</span> {c.gear}</p>{/if}
      {/if}
    </div>
  {/each}
</details>

<style>
  .cls { margin-top: 0.5rem; padding: 0.6rem; }
  .head { width: 100%; display: flex; align-items: center; gap: 0.5rem; border: 0; background: transparent; padding: 0; text-align: left; min-height: 0; }
  .features { list-style: none; padding: 0; margin: 0.5rem 0 0; }
  .features li { margin: 0.4rem 0; }
  p { margin: 0.4rem 0 0; }
</style>
