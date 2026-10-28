<script lang="ts">
  import { itemLabel } from '../lib/gear';
  import type { RollRequest, SheetView } from '../lib/render';
  import { app } from '../lib/app.svelte';
  import { holdRoll } from '../lib/hold.svelte';
  import type { Difficulty } from '../rules/rules';
  import { byCircle } from '../lib/magic';

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
    onprepslot
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
  } = $props();
  let data = $derived(v.c.data);
  let portrait = $derived(app.portraitSrc(data.portrait));
  let inv = $derived(data.inventory);
  let g = $derived(v.gear);
  // How many preparation lines fit on the back of the card.
  let prepRows = $derived(onprep ? 5 : 6);
  // Preparations and empty slots together, by circle; filled slots come before empty ones of the same circle.
  let prepLines = $derived([
    ...byCircle(inv.prepared).map(({ entry, i }) => ({ p: entry, i, circle: entry.circle })),
    ...v.emptySlots.map((circle) => ({ p: undefined, i: -1, circle }))
  ].sort((a, b) => a.circle - b.circle || Number(!a.p) - Number(!b.p)));
  // A "+N more" line takes a row itself, so one extra entry shows in its place.
  let prepShown = $derived(prepLines.length <= prepRows + 1 ? prepLines.length : prepRows);

  let scroller = $state<HTMLDivElement>();

  export function showPage(i: number) {
    scroller?.scrollTo({ left: i * scroller.clientWidth, behavior: 'smooth' });
  }

  function onscroll() {
    if (scroller && onpage) onpage(Math.round(scroller.scrollLeft / scroller.clientWidth));
  }

  function roll(r: RollRequest) {
    onroll?.(r);
  }

  // Checks: tap for normal, press and hold for Easy or Hard.
  const check = (r: Extract<RollRequest, { kind: 'check' }>) => (difficulty: Difficulty) => roll({ ...r, difficulty });
</script>

<!-- Sizes use cqw (1% of the card's width) so the screen preview and the 5×3 in
     print match exactly. At print size 1cqw = 0.05in. -->
<div class="cards layout-{layout}" bind:this={scroller} {onscroll}>
  <section class="pc front" aria-label="Front">
    <div class="face">
      <header>
        {#if onportraitfile}
          <!-- A real file input under the finger: iOS won't always open a picker from a script. -->
          <label class="portrait" class:empty={!portrait}>
            {#if portrait}<img src={portrait} alt="" />{:else}+{/if}
            <input class="pick" type="file" accept="image/*" aria-label={portrait ? 'Change portrait' : 'Add portrait'}
              onchange={(e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (file) onportraitfile(file);
                input.value = '';
              }} />
          </label>
        {:else if portrait}<img class="portrait" src={portrait} alt="" />{/if}
        <div class="who">
          <h1>{v.c.name}</h1>
          <div class="sub">{v.title}</div>
        </div>
        <button type="button" class="xp tap" disabled={!onxp} onclick={() => onxp?.()}><span>XP</span><b>{v.xp}</b></button>
      </header>

      <!-- Stats and weapons read as one block, spaced like the boxes within a row. -->
      <div class="kit">
        <div class="vitals">
          <div class="stats">
            <button type="button" class="tap" disabled={!onhp} onclick={() => onhp?.()}>
              <span>HP</span><b>{#if v.live}{v.c.hp} {:else}<i class="blank"></i>{/if}/ {v.c.hpMax}</b>
            </button>
            <button type="button" class="tap" disabled={!onroll} onclick={() => roll({ kind: 'expr', label: 'Hit die', expression: v.hitDie, min: 1 })}>
              <span>Hit die</span><b>{v.hitDie}</b>
            </button>
            <button type="button" class="tap" disabled={!ongear} onclick={() => ongear?.('armor')} title={g.worn?.name}>
              <span>Armor</span><b>{g.defense || '—'}</b>
            </button>
            <button type="button" class="tap" class:over={v.carry.encumbered} disabled={!oncarry} onclick={() => oncarry?.()}>
              <span>Carry</span><b>{v.carry.load}/{v.carry.capacity}</b>
            </button>
          </div>
          <button type="button" class="atk tap" disabled={!onroll} use:holdRoll={check({ kind: 'check', label: 'Melee attack', sides: 20, threshold: v.attacks.melee, attack: true })}>
            <span>Melee</span><b>{v.attacks.melee}+</b>
          </button>
          <button type="button" class="atk tap" disabled={!onroll} use:holdRoll={check({ kind: 'check', label: 'Ranged attack', sides: 20, threshold: v.attacks.ranged, attack: true })}>
            <span>Ranged</span><b>{v.attacks.ranged}+</b>
          </button>
        </div>

        <!-- Two hands: tap a name to change what's held, tap the dice to roll damage.
             A weapon held in both hands greys out the off hand. -->
        <div class="hands">
          <div class="hand">
            <button type="button" class="slot tap" disabled={!ongear} onclick={() => ongear?.('main')}>
              <span>Main hand</span><b>{g.main?.name ?? (v.live ? 'Empty' : '')}</b>
            </button>
            <button type="button" class="chip tap" disabled={!onroll} onclick={() => roll({ kind: 'damage', label: `${g.main?.name ?? 'Unarmed'} damage`, parts: g.damageParts })}>
              {g.damage}
            </button>
          </div>
          <div class="hand" class:blocked={g.main?.size === 'heavy'}>
            <button type="button" class="slot tap" disabled={!ongear || g.main?.size === 'heavy'} onclick={() => ongear?.('off')}>
              <span>Off hand</span><b class:aside={g.bothHands}>{g.bothHands ? 'Main weapon two-handed' : g.off?.name ?? (v.live ? 'Empty' : '')}</b>
            </button>
            {#if g.off}<span class="chip note">{g.off.shield ? 'Shield' : '+d6'}</span>{/if}
          </div>
        </div>
      </div>

      <div class="abilities">
        {#each v.abilities as a}
          <button type="button" class="ab tap" disabled={!onroll} use:holdRoll={check({ kind: 'check', label: `Save vs. ${a.save}`, sides: 20, threshold: a.threshold })}>
            <span class="lbl">{a.short} {a.score}</span>
            <span class="save">vs. {a.save}</span>
            <b>{a.threshold}+</b>
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section class="pc back" aria-label="Back">
    <div class="face">
      <!-- One column per ability, its three talents underneath. -->
      <div class="talents">
        {#each v.abilities.filter((a) => v.talents.some((t) => t.ability === a.id)) as a}
          <div class="tcol">
            {#each v.talents.filter((t) => t.ability === a.id) as t}
              <button type="button" class="tal tap" disabled={!onroll} use:holdRoll={check({ kind: 'check', label: t.name, sides: 6, threshold: t.threshold })}>
                <span>{t.name}{t.expert ? '*' : ''}</span><b>{t.threshold}+</b>
              </button>
            {/each}
          </div>
        {/each}
      </div>

      <div class="cols">
        <div>
          <h2>{v.cls.name}</h2>
          <ul>{#each v.features as f}<li>{f.name}</li>{/each}</ul>
          {#each v.levels.filter((l) => l.feat) as l}<div class="note">L{l.level}: {l.feat}</div>{/each}
        </div>
        <div>
          {#if v.cls.magic}
            <h2>{v.cls.magic.prepared}s</h2>
            <ul>
              {#each prepLines.slice(0, prepShown) as line}
                {#if line.p}
                  {@const p = line.p}
                  {#if onprep}
                    <li><button type="button" class="prep tap" class:spent={p.spent} disabled={!p.spent && !!v.magicBlockedBy} onclick={() => onprep(line.i)}>
                      <span class="act">{p.spent ? 'Prepare' : 'Use'}</span><span class="what">{v.circle(p.circle)} {p.magic || '—'}</span>
                    </button></li>
                  {:else}
                    <li>{p.spent ? '☒' : '☐'} {v.circle(p.circle)} {p.magic}</li>
                  {/if}
                {:else if onprepslot}
                  <li><button type="button" class="prep tap empty" disabled={!!v.magicBlockedBy} onclick={() => onprepslot(line.circle)}>
                    <span class="act">Prepare</span><span class="what">{v.circle(line.circle)} ________</span>
                  </button></li>
                {:else}
                  <li class="muted">☐ {v.circle(line.circle)} ________</li>
                {/if}
              {/each}
              {#if prepLines.length > prepShown}<li class="muted">+{prepLines.length - prepShown} more</li>{/if}
            </ul>
          {:else}
            <h2>Gear</h2>
            <ul>
              {#each inv.items.slice(0, 5) as item}<li>{itemLabel(item)}</li>{/each}
              {#if inv.items.length > 5}<li class="muted">+{inv.items.length - 5} more</li>{/if}
            </ul>
          {/if}
        </div>
        <div>
          <h2>Retinue</h2>
          <ul>
            {#each data.followers.slice(0, 4) as f}<li>{f.name} <span class="muted">({f.attitude})</span></li>{/each}
            {#if !data.followers.length}<li class="muted">—</li>{/if}
          </ul>
        </div>
      </div>
    </div>
  </section>
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
  .tap {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    -webkit-tap-highlight-color: rgb(138 46 31 / 0.15);
  }
  .tap:disabled { cursor: default; }
  .tap:not(:disabled):active { background: rgb(138 46 31 / 0.12); }
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
  /* Padding and gaps live on an inner face: a container can't size its own box in cqw,
     so on .pc itself they would follow the window width instead of the card. */
  .face { height: 100%; box-sizing: border-box; padding: 3.2cqw 3.6cqw; display: flex; flex-direction: column; gap: 2cqw; }
  .face > * { font-size: 2.2cqw; }
  /* Spare height is shared evenly between the rows of the front. */
  .front .face { justify-content: space-between; }
  header { display: flex; gap: 2.4cqw; align-items: center; }
  .portrait { margin: 0; width: 12cqw; height: 12cqw; flex: none; border-radius: 1.2cqw; object-fit: cover; border: 0.2cqw solid #1d1712; overflow: hidden; position: relative; cursor: pointer; }
  .pick { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 0; }
  .portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .portrait.empty { display: grid; place-items: center; border-style: dashed; color: #8a7a68; font: 4cqw Georgia, serif; }
  .who { flex: 1; min-width: 0; }
  h1 { font: 700 5.2cqw/1.05 Georgia, serif; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 2.3cqw; color: #5b4a36; margin-top: 0.4cqw; }
  .xp { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.3cqw; min-width: 15cqw; padding: 1cqw 1.6cqw; border: 0.15cqw solid #c9b896; border-radius: 1cqw; text-align: center; }
  .xp span { font-size: 1.7cqw; text-transform: uppercase; letter-spacing: 0.06em; color: #5b4a36; }
  .xp b { font: 700 3.6cqw/1.1 Georgia, serif; white-space: nowrap; }
  .kit { display: flex; flex-direction: column; gap: 1cqw; }
  .vitals { display: grid; grid-template-columns: 4fr 1fr 1fr; gap: 1cqw; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); border: 0.15cqw solid #c9b896; border-radius: 1cqw; }
  .stats > *, .atk { padding: 0.8cqw 1cqw; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  /* Labels sit at the top; numbers stay centered in the room below. */
  .stats > * { justify-content: flex-start; }
  .stats b { flex: 1; display: flex; align-items: center; }
  .stats > * + * { border-left: 0.15cqw solid #c9b896; }
  .atk { border: 0.15cqw solid #c9b896; border-radius: 1cqw; }
  .vitals span { font-size: 1.7cqw; text-transform: uppercase; letter-spacing: 0.06em; color: #5b4a36; }
  .vitals b { font: 700 3.2cqw/1.1 Georgia, serif; white-space: nowrap; }
  .atk span { font-size: 2cqw; text-transform: none; letter-spacing: 0; }
  .atk { align-items: center; justify-content: center; text-align: center; }
  .atk b { font-size: 4.8cqw; }
  .blank { display: inline-block; width: 4.5cqw; border-bottom: 0.2cqw solid #1d1712; margin-right: 0.4cqw; }
  .abilities { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1cqw; }
  .ab { border: 0.15cqw solid #c9b896; border-radius: 1cqw; text-align: center; padding: 0.8cqw 0; display: flex; flex-direction: column; justify-content: center; }
  .ab .lbl { font: 700 2.8cqw/1.2 Georgia, serif; }
  /* Ability on top, then a gap, then the save it guards against with its threshold. */
  .ab .save { font-size: 2cqw; color: #5b4a36; margin-top: 1cqw; }
  .ab b { font: 700 6.4cqw/0.9 Georgia, serif; margin-top: 0.3cqw; }
  .hands { display: grid; grid-template-columns: 1fr 1fr; gap: 1cqw; }
  .hand { display: flex; align-items: stretch; gap: 0.8cqw; border: 0.15cqw solid #c9b896; border-radius: 1cqw; padding: 0.6cqw 0.8cqw; min-width: 0; }
  .hand .slot { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .hand .slot span { font-size: 1.7cqw; text-transform: uppercase; letter-spacing: 0.06em; color: #5b4a36; }
  .hand .slot b { font: 700 2.8cqw/1.2 Georgia, serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hand.blocked { background: #e6dfd2; color: #8a7a68; }
  .hand .slot b.aside, .hand.blocked .slot b { font: italic 2.3cqw/1.2 Georgia, serif; }
  .chip { display: flex; flex-direction: column; align-items: center; justify-content: center; border: 0.15cqw solid #c9b896; border-radius: 0.8cqw; padding: 0 1.2cqw; font: 700 2.8cqw Georgia, serif; white-space: nowrap; }
  .chip.note { font-size: 2.3cqw; border-style: dashed; color: #5b4a36; }
  .over b { color: #8a2e1f; }
  .talents { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1cqw; }
  .tcol { display: flex; flex-direction: column; gap: 0.9cqw; min-width: 0; }
  .tal { display: flex; justify-content: space-between; gap: 0.5cqw; border: 0.15cqw solid #c9b896; border-radius: 1cqw; padding: 1.3cqw 1.2cqw; font-size: 2.3cqw; }
  .tal span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tal { align-items: center; }
  .tal b { font: 700 3.6cqw/1 Georgia, serif; }
  .cols { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 2.4cqw; flex: 1; min-height: 0; }
  h2 { font: 700 2.4cqw/1.2 Georgia, serif; margin: 0 0 0.6cqw; border-bottom: 0.2cqw solid #1d1712; }
  ul { list-style: none; margin: 0; padding: 0; }
  .prep { display: flex; align-items: baseline; gap: 0.8cqw; width: 100%; margin-bottom: 0.6cqw; padding: 0.4cqw 0.8cqw; border: 0.15cqw solid #c9b896; border-radius: 0.8cqw; font-size: 2cqw; line-height: 1.3; }
  .prep .act { flex: none; font-size: 1.6cqw; text-transform: uppercase; letter-spacing: 0.06em; color: #8a2e1f; font-weight: 700; }
  .prep .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prep.empty { border-style: dashed; color: #8a7a68; }
  .prep.empty .act { color: #3f6f4f; }
  .prep.spent { border-style: dashed; color: #8a7a68; }
  .prep.spent .act { color: #3f6f4f; }
  .prep:disabled { opacity: 0.5; }
  li, .note { font-size: 2cqw; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .muted { color: #7a6a55; }

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
