<script lang="ts">
  // A book page reference ("p. 144"). When the entry has an SRD wiki page, the
  // reference opens it.
  let { page, href, prefix = 'p. ' }: { page?: number | string; href?: string | null; prefix?: string } = $props();
</script>

{#if page}{#if href}<a class="pageref" {href} target="_blank" rel="noopener" title="Read it in the SRD wiki">{prefix}{page}</a>{:else}{prefix}{page}{/if}{:else if href}<a class="pageref" {href} target="_blank" rel="noopener">wiki</a>{/if}

<style>
  .pageref { color: var(--accent); }
</style>
