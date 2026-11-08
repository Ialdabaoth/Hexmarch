<script lang="ts">
  import { app, type RenderMode } from '../lib/app.svelte';
  import { sheetView } from '../lib/render';
  import Postcard from './Postcard.svelte';
  import PageSheet from './PageSheet.svelte';

  let { id, mode }: { id: string; mode: RenderMode } = $props();

  let data = $derived(app.sheets.find((s) => s.id === id));
  let view = $derived(data ? sheetView(data) : undefined);

  // The PDF's page size follows the mode: a 5×3 in card, or US letter.
  let pageCss = $derived(
    mode === 'postcard' ? '@page { size: 5in 3in; margin: 0; }' : '@page { size: letter; margin: 0.5in; }'
  );

  function setMode(m: RenderMode) {
    app.view = { name: 'render', id, mode: m };
  }

  function savePdf() {
    const before = document.title;
    // Browsers use the page title as the suggested PDF file name.
    if (view) document.title = `${view.c.name} - ${mode === 'postcard' ? 'postcard' : 'sheet'}`;
    window.print();
    document.title = before;
  }
</script>

<svelte:head>
  {@html `<style>${pageCss}</style>`}
</svelte:head>

{#if view}
  <div class="no-print toolbar">
    <div class="row">
      <button class="ghost" onclick={() => (app.view = { name: 'sheet', id })}>‹ Sheet</button>
      <div class="grow"></div>
      <button class="primary" onclick={savePdf}>Save as PDF</button>
    </div>
    <div class="modes" role="group" aria-label="Layout">
      <button class:on={mode === 'postcard'} onclick={() => setMode('postcard')}>Postcard 3×5</button>
      <button class:on={mode === 'page'} onclick={() => setMode('page')}>Page 8.5×11</button>
    </div>
    <p class="small muted">
      {mode === 'postcard' ? 'Front and back of an index card.' : 'Letter paper; long inventories run onto more pages.'}
      In the print dialog, choose "Save as PDF" (on iPhone, pinch out on the preview, then Share).
    </p>
  </div>
  {#if mode === 'postcard'}
    <Postcard {view} />
  {:else}
    <PageSheet {view} />
  {/if}
{:else}
  <p>Character not found.</p>
{/if}

<style>
  .toolbar { margin-bottom: 1rem; }
  .modes { display: flex; margin-top: 0.5rem; }
  .modes button { flex: 1; border-radius: 0; }
  .modes button:first-child { border-radius: 10px 0 0 10px; }
  .modes button:last-child { border-radius: 0 10px 10px 0; }
  .modes button.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
</style>
