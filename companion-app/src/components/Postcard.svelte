<script lang="ts">
  import type { WornSlot } from '../lib/gear';
  import type { RollRequest, SheetView } from '../lib/render';
  import { app } from '../lib/app.svelte';
  import type { Difficulty } from '../rules/rules';
  import { layoutFor } from '../lib/layout/layouts';
  import { sheetScope } from '../lib/layout/sheet-scope';
  import type { Check } from '../lib/layout/parse';
  import LayoutNodes, { type LayoutFrame } from './layout/LayoutNodes.svelte';

  // The index card's two faces. The Companion owns the card (its size, swiping, print); what goes on
  // each face comes from the ruleset's module layout (SHEET_LAYOUT.md: card-front and card-back).
  // With onroll, values on the card are buttons that roll; without it the card is print-only.
  // layout "carousel" shows the faces side by side for swiping; "stack" is for print.
  let {
    view: v,
    onroll,
    layout = 'stack',
    onpage,
    onhp,
    onportraitfile,
    onxp,
    ongear,
    oncarry,
    onprep,
    onprepslot,
    onequip
  }: {
    view: SheetView;
    onroll?: (r: RollRequest) => void;
    layout?: 'stack' | 'carousel';
    onpage?: (i: number) => void;
    // Tapping HP calls this (the home screen opens an editor).
    onhp?: () => void;
    // With this, the portrait is a photo picker and gets the chosen file.
    onportraitfile?: (file: File) => void;
    // Tapping XP calls this (the home screen opens the XP and level-up editor).
    onxp?: () => void;
    // Tapping Armor or a hand calls this (the home screen opens a picker).
    ongear?: (slot: 'armor' | 'main' | 'off') => void;
    // Tapping Carry calls this (the home screen opens the inventory).
    oncarry?: () => void;
    // Tapping a preparation calls this: use it, or prepare it again once spent.
    onprep?: (index: number) => void;
    // Tapping an empty preparation slot, with the circle it holds.
    onprepslot?: (circle: number) => void;
    // Tapping a worn slot calls this (the home screen opens a picker for it).
    onequip?: (slot: WornSlot) => void;
  } = $props();
  let portrait = $derived(app.portraitSrc(v.c.data.portrait));
  let lay = $derived(layoutFor(v.c.rules.id));
  let scope = $derived(sheetScope(v, { live: v.live, edit: !!onprep }));

  let scroller = $state<HTMLDivElement>();

  export function showPage(i: number) {
    scroller?.scrollTo({ left: i * scroller.clientWidth, behavior: 'smooth' });
  }

  function onscroll() {
    if (scroller && onpage) onpage(Math.round(scroller.scrollLeft / scroller.clientWidth));
  }

  // A roll button on the layout names a check and a value; the card turns it into a roll.
  function roll(check: Check, value: unknown, o: { label?: string; min?: number; difficulty?: Difficulty }) {
    if (!onroll) return;
    const difficulty = o.difficulty;
    if (check === 'talent') {
      const t = v.talents.find((x) => x.id === value);
      if (t) onroll({ kind: 'check', label: o.label ?? t.name, sides: 6, threshold: t.threshold, difficulty });
    } else if (check === 'save') {
      const a = v.abilities.find((x) => x.id === value);
      if (a) onroll({ kind: 'check', label: o.label ?? `Save vs. ${a.save}`, sides: 20, threshold: a.threshold, difficulty });
    } else if (check === 'attack') {
      if (typeof value === 'number') onroll({ kind: 'check', label: o.label ?? 'Attack', sides: 20, threshold: value, attack: true, difficulty });
    } else if (check === 'damage') {
      onroll({ kind: 'damage', label: `${v.gear.main?.name ?? 'Unarmed'} damage`, parts: v.gear.damageParts });
    } else if (check === 'dice') {
      onroll({ kind: 'expr', label: o.label ?? String(value), expression: String(value), ...(o.min !== undefined ? { min: o.min } : {}) });
    }
  }

  let frame: LayoutFrame = $derived({
    roll: onroll ? roll : undefined,
    actions: {
      hp: onhp && (() => onhp()),
      xp: onxp && (() => onxp()),
      armor: ongear && (() => ongear('armor')),
      main: ongear && (() => ongear('main')),
      off: ongear && (() => ongear('off')),
      carry: oncarry && (() => oncarry()),
      prep: onprep && ((i) => onprep(Number(i))),
      prepslot: onprepslot && ((c) => onprepslot(Number(c))),
      equip: onequip && ((s) => onequip(s as WornSlot))
    },
    portrait: portraitSlot
  });
</script>

{#snippet portraitSlot(cls: string)}
  {#if onportraitfile}
    <!-- A real file input under the finger: iOS won't always open a picker from a script. -->
    <label class="{cls}{portrait ? '' : ' empty'}">
      {#if portrait}<img src={portrait} alt="" />{:else}+{/if}
      <input class="pick" type="file" accept="image/*" aria-label={portrait ? 'Change portrait' : 'Add portrait'}
        onchange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (file) onportraitfile(file);
          input.value = '';
        }} />
    </label>
  {:else if portrait}<img class={cls} src={portrait} alt="" />{/if}
{/snippet}

<svelte:head>{#if lay?.css}{@html `<style data-layout="${lay.module}">${lay.css}</style>`}{/if}</svelte:head>

<div class="cards layout-{layout}" bind:this={scroller} {onscroll}>
  {#each [['card-front', 'Front'], ['card-back', 'Back']] as const as [surface, label] (surface)}
    <section class="pc {lay?.scope ?? ''}" aria-label={label}>
      {#if lay?.surfaces[surface]}
        <LayoutNodes nodes={lay.surfaces[surface]} {scope} {frame} />
      {:else}
        <p class="missing">This ruleset's module has no {label.toLowerCase()} for the card.</p>
      {/if}
    </section>
  {/each}
</div>

<style>
  .cards { display: grid; gap: 16px; }
  .cards.layout-carousel {
    display: flex;
    gap: 0;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .cards.layout-carousel::-webkit-scrollbar { display: none; }
  .cards.layout-carousel .pc { flex: 0 0 100%; scroll-snap-align: start; }
  /* The on-screen card is a control panel, not text: no selection on long-press. */
  .cards.layout-carousel { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  /* Roll and action buttons on a layout look like the card, not like buttons. */
  .pc :global(.tap) {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    -webkit-tap-highlight-color: rgb(138 46 31 / 0.15);
  }
  .pc :global(.tap:disabled) { cursor: default; }
  .pc :global(.tap:not(:disabled):active) { background: rgb(138 46 31 / 0.12); }
  .pc {
    container-type: inline-size;
    width: 100%;
    aspect-ratio: 5 / 3;
    background: #fffdf8;
    color: #1d1712;
    border: 1px solid #c9b896;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
    overflow: hidden;
    position: relative;
  }
  .pick { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 0; }
  .missing { padding: 1rem; color: #7a6a55; }

  @media print {
    .cards { display: block; }
    .pc {
      width: 5in;
      /* A hair under the page height so rounding never spills onto an extra page. */
      height: calc(3in - 2px);
      break-inside: avoid;
      aspect-ratio: auto;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: #fff;
      break-after: page;
    }
    .pc:last-child { break-after: auto; }
  }
</style>
