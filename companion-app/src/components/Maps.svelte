<script lang="ts">
  import { onMount } from 'svelte';
  import { loadMaps, saveMaps } from '../lib/storage';
  import {
    HEX_RADIUS,
    SQUARE_CELL,
    hexCentres,
    hexPoints,
    isAllowedBackground,
    isPointy,
    newMap,
    parseHexJson,
    snapPoint,
    viewOf,
    type GameMap,
    type Point,
    type Token,
  } from '../lib/maps';

  let maps = $state<GameMap[]>([]);
  let selectedId = $state('');
  let ready = $state(false);

  let newName = $state('');
  let newCols = $state(24);
  let newRows = $state(18);
  let bgUrl = $state('');
  let tokenLabel = $state('');
  let problem = $state('');

  let svg = $state<SVGSVGElement>();
  let dragId = $state<string | null>(null);

  let current = $derived(maps.find((m) => m.id === selectedId));
  let view = $derived(current ? viewOf(current) : null);
  let centres = $derived(current?.kind === 'hex' ? hexCentres(current.hexjson!) : []);

  onMount(async () => {
    try {
      maps = await loadMaps();
      selectedId = maps[0]?.id ?? '';
    } catch (e) {
      problem = (e as Error).message;
    }
    ready = true;
  });

  async function persist() {
    try {
      await saveMaps(maps);
    } catch (e) {
      problem = `Could not save the map: ${(e as Error).message}`;
    }
  }

  function addSquare() {
    const m = newMap({ name: newName.trim() || 'Square map', kind: 'square', cols: Math.max(2, Math.floor(newCols)), rows: Math.max(2, Math.floor(newRows)) });
    maps = [...maps, m];
    selectedId = m.id;
    newName = '';
    persist();
  }

  // Reads a HexJSON file, then starts a hex map from it.
  async function addHexFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const hj = parseHexJson(await file.text());
      const m = newMap({ name: newName.trim() || file.name.replace(/\.[^.]+$/, ''), kind: 'hex', hexjson: hj });
      maps = [...maps, m];
      selectedId = m.id;
      newName = '';
      problem = '';
      persist();
    } catch (err) {
      problem = (err as Error).message;
    }
    (e.target as HTMLInputElement).value = '';
  }

  function setBackground(src: string) {
    if (!current) return;
    if (!isAllowedBackground(src)) {
      problem = 'Backgrounds need an https:// link or an image file.';
      return;
    }
    current.background = src;
    problem = '';
    persist();
  }

  function useBgUrl() {
    setBackground(bgUrl.trim());
    bgUrl = '';
  }

  // Reads an image file into a data URL so it is kept with the map on this device.
  function uploadBackground(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      problem = 'That file is not an image.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBackground(String(reader.result));
    reader.onerror = () => (problem = 'Could not read that image.');
    reader.readAsDataURL(file);
    (e.target as HTMLInputElement).value = '';
  }

  function toggle(key: 'drawGrid' | 'snap') {
    if (!current) return;
    current[key] = !current[key];
    persist();
  }

  function addToken() {
    if (!current || !view) return;
    const label = tokenLabel.trim() || `Token ${current.tokens.length + 1}`;
    const at = current.snap ? snapPoint(current, { x: view.x + view.w / 2, y: view.y + view.h / 2 }) : { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    current.tokens.push({ id: crypto.randomUUID(), label, x: at.x, y: at.y });
    tokenLabel = '';
    persist();
  }

  function removeToken(id: string) {
    if (!current) return;
    current.tokens = current.tokens.filter((t) => t.id !== id);
    persist();
  }

  function removeMap() {
    if (!current) return;
    const gone = current.id;
    maps = maps.filter((m) => m.id !== gone);
    selectedId = maps[0]?.id ?? '';
    persist();
  }

  // Converts a pointer position into map units, using the canvas's own transform.
  function toMap(e: PointerEvent): Point | null {
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  function grab(e: PointerEvent, t: Token) {
    dragId = t.id;
    svg?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function drag(e: PointerEvent) {
    if (!dragId || !current) return;
    const p = toMap(e);
    const token = current.tokens.find((t) => t.id === dragId);
    if (!p || !token) return;
    const at = current.snap ? snapPoint(current, p) : p;
    token.x = at.x;
    token.y = at.y;
  }

  function drop() {
    if (!dragId) return;
    dragId = null;
    persist();
  }

  function fontSize(): number {
    return current?.kind === 'hex' ? HEX_RADIUS * 0.45 : SQUARE_CELL * 0.35;
  }
</script>

<details class="section">
  <summary><h2>Maps</h2></summary>

  {#if !ready}
    <p class="small muted">Loading maps…</p>
  {:else}
    {#if problem}<p class="small" role="alert">{problem}</p>{/if}

    <div class="row">
      <select class="grow" bind:value={selectedId} aria-label="Choose a map">
        {#if maps.length === 0}<option value="">No maps yet</option>{/if}
        {#each maps as m (m.id)}<option value={m.id}>{m.name} ({m.kind === 'hex' ? 'hex' : 'square'})</option>{/each}
      </select>
    </div>

    <section class="card" style="margin-top:0.75rem">
      <h3>New map</h3>
      <div class="grid2">
        <div><label for="map-name">Name</label><input id="map-name" bind:value={newName} placeholder="The Pale Keep" /></div>
        <div></div>
        <div><label for="map-cols">Columns</label><input id="map-cols" type="number" min="2" max="200" bind:value={newCols} /></div>
        <div><label for="map-rows">Rows</label><input id="map-rows" type="number" min="2" max="200" bind:value={newRows} /></div>
      </div>
      <div class="row" style="margin-top:0.5rem">
        <button class="primary" onclick={addSquare}>Square map</button>
        <label class="button-like">
          Hex map from HexJSON
          <input type="file" accept=".json,.hexjson,application/json" onchange={addHexFile} hidden />
        </label>
      </div>
    </section>

    {#if current && view}
      <section class="card" style="margin-top:0.75rem">
        <div class="row">
          <button onclick={() => toggle('drawGrid')} aria-pressed={current.drawGrid}>{current.drawGrid ? 'Hide grid' : 'Draw grid'}</button>
          <button onclick={() => toggle('snap')} aria-pressed={current.snap}>{current.snap ? 'Snap to grid: on' : 'Snap to grid: off'}</button>
          <button onclick={removeMap}>Delete map</button>
        </div>

        <div class="row" style="margin-top:0.5rem">
          <input class="grow" type="url" bind:value={bgUrl} placeholder="Background image link (https://…)" aria-label="Background image link" autocomplete="off" />
          <button onclick={useBgUrl} disabled={!bgUrl.trim()}>Use link</button>
        </div>
        <div class="row" style="margin-top:0.5rem">
          <label class="button-like">
            Upload background
            <input type="file" accept="image/*" onchange={uploadBackground} hidden />
          </label>
          {#if current.background}<button onclick={() => setBackground('')}>Remove background</button>{/if}
        </div>

        <div class="row" style="margin-top:0.5rem">
          <input class="grow" bind:value={tokenLabel} placeholder="Token name" aria-label="Token name" />
          <button onclick={addToken}>Add token</button>
        </div>
      </section>

      <svg
        bind:this={svg}
        class="map"
        viewBox="{view.x} {view.y} {view.w} {view.h}"
        role="img"
        aria-label="{current.name} map"
        onpointermove={drag}
        onpointerup={drop}
        onpointercancel={drop}
      >
        {#if current.background}
          <image href={current.background} x={view.x} y={view.y} width={view.w} height={view.h} preserveAspectRatio="xMidYMid meet" />
        {/if}

        {#if current.drawGrid && current.kind === 'square'}
          {#each Array.from({ length: current.cols + 1 }, (_, i) => i) as i (i)}
            <line x1={i * SQUARE_CELL} y1="0" x2={i * SQUARE_CELL} y2={current.rows * SQUARE_CELL} class="grid" />
          {/each}
          {#each Array.from({ length: current.rows + 1 }, (_, i) => i) as i (i)}
            <line x1="0" y1={i * SQUARE_CELL} x2={current.cols * SQUARE_CELL} y2={i * SQUARE_CELL} class="grid" />
          {/each}
        {/if}

        {#if current.drawGrid && current.kind === 'hex'}
          {#each centres as c (c.key)}
            <polygon points={hexPoints(c.x, c.y, isPointy(current.hexjson!.layout))} class="hex" />
          {/each}
        {/if}

        {#each current.tokens as t (t.id)}
          <g class="token" role="button" tabindex="-1" aria-label={t.label} onpointerdown={(e) => grab(e, t)}>
            <circle cx={t.x} cy={t.y} r={current.kind === 'hex' ? HEX_RADIUS * 0.6 : SQUARE_CELL * 0.4} />
            <text x={t.x} y={t.y} font-size={fontSize()} text-anchor="middle" dominant-baseline="central">{t.label}</text>
          </g>
        {/each}
      </svg>

      {#if current.tokens.length}
        <ul class="tokens">
          {#each current.tokens as t (t.id)}
            <li><span>{t.label}</span> <button class="small" onclick={() => removeToken(t.id)} aria-label="Remove {t.label}">Remove</button></li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</details>

<style>
  .map { width: 100%; height: auto; max-height: 70vh; margin-top: 0.75rem; background: var(--card); border-radius: 8px; touch-action: none; }
  .grid { stroke: rgba(0, 0, 0, 0.25); stroke-width: 1; }
  .hex { fill: none; stroke: rgba(0, 0, 0, 0.3); stroke-width: 1; }
  .token { cursor: grab; }
  .token circle { fill: var(--accent, #7a4fd1); stroke: #fff; stroke-width: 2; opacity: 0.9; }
  .token text { fill: #fff; font-weight: 600; pointer-events: none; }
  .button-like { display: inline-block; padding: 0.4rem 0.8rem; border: 1px solid currentColor; border-radius: 6px; cursor: pointer; }
  .tokens { list-style: none; padding: 0; margin: 0.5rem 0 0; }
  .tokens li { display: flex; justify-content: space-between; align-items: center; padding: 0.25rem 0; }
</style>
