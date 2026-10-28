<script lang="ts">
  import type { Magic } from '../lib/magic-effects';

  // What the magic items worn, wielded and carried are doing, item by item.
  let { magic }: { magic: Magic } = $props();

  let bySource = $derived.by(() => {
    const out = new Map<string, string[]>();
    for (const l of magic.lines()) out.set(l.source, [...(out.get(l.source) ?? []), l.text]);
    return [...out];
  });
</script>

{#if bySource.length}
  <h2>Magic items</h2>
  <ul class="magic-items">
    {#each bySource as [source, lines]}
      <li><strong>✦ {source}.</strong> {lines.join('. ')}.</li>
    {/each}
  </ul>
  <p class="small muted">Already counted in the numbers above, except Easy or Hard rolls and anything with a condition.</p>
{/if}

<style>
  .magic-items { padding-left: 0; list-style: none; margin: 0.3rem 0; }
  .magic-items li { padding: 0.25rem 0; border-bottom: 1px solid var(--line); }
</style>
