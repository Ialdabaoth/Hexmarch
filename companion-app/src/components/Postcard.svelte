<script lang="ts">
  import type { RollRequest, SheetView } from '../lib/render';
  import { holdRoll } from '../lib/hold.svelte';
  import type { Difficulty } from '../rules/rules';

  // With onroll, values on the card are buttons that roll; without it the card is print-only.
  // layout "carousel" shows the faces side by side for swiping; "stack" is for print.
  let {
    view: v,
    onroll,
    layout = 'stack',
    onpage,
    onhp,
    onportraitfile,
    onxp
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
  } = $props();
  let data = $derived(v.c.data);
  let inv = $derived(data.inventory);

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
    <header>
      {#if onportraitfile}
        <!-- A real file input under the finger: iOS won't always open a picker from a script. -->
        <label class="portrait" class:empty={!data.portrait}>
          {#if data.portrait}<img src={data.portrait} alt="" />{:else}+{/if}
          <input class="pick" type="file" accept="image/*" aria-label={data.portrait ? 'Change portrait' : 'Add portrait'}
            onchange={(e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (file) onportraitfile(file);
              input.value = '';
            }} />
        </label>
      {:else if data.portrait}<img class="portrait" src={data.portrait} alt="" />{/if}
      <div class="who">
        <h1>{v.c.name}</h1>
        <div class="sub">{v.title} · {#if onxp}<button type="button" class="xpbtn tap" onclick={() => onxp()}>XP {v.xp}</button>{:else}XP {v.xp}{/if}</div>
      </div>
      <div class="brand">{#if v.c.rules.id === 'mm'}Materia<br />Mundi{:else}{v.c.rules.name}{/if}</div>
    </header>

    <div class="vitals">
      <div class="stats">
        <button type="button" class="tap" disabled={!onhp} onclick={() => onhp?.()}>
          <span>HP</span><b>{#if v.live}{v.c.hp} {:else}<i class="blank"></i>{/if}/ {v.c.hpMax}</b>
        </button>
        <button type="button" class="tap" disabled={!onroll} onclick={() => roll({ kind: 'expr', label: 'Hit die', expression: v.hitDie, min: 1 })}>
          <span>Hit die</span><b>{v.hitDie}</b>
        </button>
        <div><span>Armor</span><b>{inv.armor.rating || '—'}</b></div>
        <div><span>Carry</span><b>{v.carry.encumbrance}/{v.carry.capacity}</b></div>
      </div>
      <button type="button" class="atk tap" disabled={!onroll} use:holdRoll={check({ kind: 'check', label: 'Melee attack', sides: 20, threshold: v.attacks.melee, attack: true })}>
        <span>Melee</span><b>{v.attacks.melee}+</b>
      </button>
      <button type="button" class="atk tap" disabled={!onroll} use:holdRoll={check({ kind: 'check', label: 'Ranged attack', sides: 20, threshold: v.attacks.ranged, attack: true })}>
        <span>Ranged</span><b>{v.attacks.ranged}+</b>
      </button>
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

    <div class="weapons">
      {#if inv.weapons.length}
        {#each inv.weapons.slice(0, 3) as w}
          <button type="button" class="tap" disabled={!onroll} onclick={() => roll({ kind: 'expr', label: `${w.name} damage`, expression: w.damage })}>
            {w.name} <b>{w.damage}</b>{w.range === 'ranged' ? ' (r)' : ''}
          </button>
        {/each}
      {:else}
        <span class="muted">Weapons: ________________</span>
      {/if}
    </div>
  </section>

  <section class="pc back" aria-label="Back">
    <!-- One column per ability, its three talents underneath. -->
    <div class="talents">
      {#each v.abilities.filter((a) => v.talents.some((t) => t.ability === a.id)) as a}
        <div class="tcol">
          <span class="thead">{a.short} {a.score}</span>
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
            {#each inv.prepared.slice(0, 5) as p}<li>☐ {v.circle(p.circle)} {p.magic}</li>{/each}
            {#if !inv.prepared.length}<li class="muted">☐ ________</li><li class="muted">☐ ________</li>{/if}
          </ul>
        {:else}
          <h2>Gear</h2>
          <ul>
            {#each inv.items.slice(0, 5) as item}<li>{item}</li>{/each}
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
  .pc > * { font-size: 2.2cqw; }
  .front, .back { padding: 3.2cqw 3.6cqw; display: flex; flex-direction: column; gap: 2cqw; }
  /* Spare height is shared evenly between the rows of the front. */
  .front { justify-content: space-between; }
  header { display: flex; gap: 2.4cqw; align-items: center; }
  .portrait { width: 12cqw; height: 12cqw; flex: none; border-radius: 1.2cqw; object-fit: cover; border: 0.2cqw solid #1d1712; overflow: hidden; position: relative; cursor: pointer; }
  .pick { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 0; }
  .portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .portrait.empty { display: grid; place-items: center; border-style: dashed; color: #8a7a68; font: 4cqw Georgia, serif; }
  .who { flex: 1; min-width: 0; }
  h1 { font: 700 5.2cqw/1.05 Georgia, serif; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 2.3cqw; color: #5b4a36; margin-top: 0.4cqw; }
  .xpbtn { border: 0.15cqw solid #c9b896; border-radius: 0.8cqw; padding: 0.2cqw 1cqw; color: #1d1712; font-weight: 600; }
  .brand { font: italic 700 2.2cqw/1 Georgia, serif; color: #8a2e1f; text-align: right; letter-spacing: 0.05em; }
  .vitals { display: grid; grid-template-columns: 4fr 1fr 1fr; gap: 1cqw; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); border: 0.2cqw solid #1d1712; border-radius: 1cqw; }
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
  .weapons { display: flex; flex-wrap: wrap; gap: 0.6cqw 2.4cqw; font-size: 2.3cqw; border-top: 0.15cqw solid #c9b896; padding-top: 1cqw; }
  .talents { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1cqw; }
  .tcol { display: flex; flex-direction: column; gap: 0.9cqw; min-width: 0; }
  .thead { font-size: 1.7cqw; text-transform: uppercase; letter-spacing: 0.08em; color: #5b4a36; text-align: center; }
  .tal { display: flex; justify-content: space-between; gap: 0.5cqw; border: 0.15cqw solid #c9b896; border-radius: 1cqw; padding: 1.3cqw 1.2cqw; font-size: 2.3cqw; }
  .tal span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tal { align-items: center; }
  .tal b { font: 700 3.6cqw/1 Georgia, serif; }
  .cols { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 2.4cqw; flex: 1; min-height: 0; }
  h2 { font: 700 2.4cqw/1.2 Georgia, serif; margin: 0 0 0.6cqw; border-bottom: 0.2cqw solid #1d1712; }
  ul { list-style: none; margin: 0; padding: 0; }
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
