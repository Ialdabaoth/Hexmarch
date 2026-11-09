<script lang="ts">
  import type { SheetView } from '../lib/render';
  import { app } from '../lib/app.svelte';
  import { layoutFor } from '../lib/layout/layouts';
  import { sheetScope } from '../lib/layout/sheet-scope';
  import LayoutNodes, { type LayoutFrame } from './layout/LayoutNodes.svelte';

  // A full letter-size sheet. The Companion owns the page; what goes on it comes from the ruleset's
  // module layout (SHEET_LAYOUT.md: page-1). A printout: no rolls, no editors.
  let { view: v }: { view: SheetView } = $props();
  let lay = $derived(layoutFor(v.c.rules.id));
  let scope = $derived(sheetScope(v, { live: false, edit: false }));
  let portrait = $derived(app.portraitSrc(v.c.data.portrait));
  let frame: LayoutFrame = $derived({ actions: {}, portrait: portraitSlot });
</script>

{#snippet portraitSlot(cls: string)}
  {#if portrait}<img class={cls} src={portrait} alt="" />{/if}
{/snippet}

<svelte:head>{#if lay?.css}{@html `<style data-layout="${lay.module}">${lay.css}</style>`}{/if}</svelte:head>

<article class="page {lay?.scope ?? ''}">
  {#if lay?.surfaces['page-1']}
    <LayoutNodes nodes={lay.surfaces['page-1']} {scope} {frame} />
  {:else}
    <p>This ruleset's module has no page layout.</p>
  {/if}
</article>
