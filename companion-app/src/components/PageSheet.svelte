<script lang="ts">
  import type { SheetView } from '../lib/render';
  import { app } from '../lib/app.svelte';
  import { damage as dice, grips, type WeaponItem } from '../lib/gear';

  let { view: v }: { view: SheetView } = $props();
  let data = $derived(v.c.data);
  let inv = $derived(data.inventory);

  const held = (w: WeaponItem) => (inv.wielded[0] === w.id ? (inv.wielded[1] === w.id || w.size === 'heavy' ? 'both hands' : 'main') : inv.wielded[1] === w.id ? 'off' : '');
  const str = $derived(v.c.abilities.str);
  const damage = (w: WeaponItem) => (w.shield ? 'shield' : grips(w).map((g) => dice(w, undefined, g === 'two', str)).filter((d, i, all) => all.indexOf(d) === i).join(' / '));
  const reach = (w: WeaponItem) => (w.ranged ? `range ${w.range}` : [w.reach ? `reach ${w.reach}` : '', w.range ? `thrown ${w.range}` : ''].filter(Boolean).join(', '));
</script>

<!-- A full letter-size sheet. Sections flow onto extra pages as inventories grow;
     no section is split across a page break unless it is longer than a page. -->
<article class="pg">
  <header>
    {#if app.portraitSrc(data.portrait)}<img class="portrait" src={app.portraitSrc(data.portrait)} alt="" />{/if}
    <div class="who">
      <h1>{v.c.name}</h1>
      <div class="sub">{v.title} · Hit die {v.hitDie} · XP {v.xp}</div>
    </div>
    <div class="brand">{v.c.rules.id === 'mm' ? 'Materia Mundi' : v.c.rules.name}</div>
  </header>

  <div class="vitals">
    <div><span>Hit points</span><b><i class="blank"></i> / {v.c.hpMax}</b></div>
    <div><span>Armor</span><b>{v.gear.defense || '—'}</b><small>{v.gear.worn?.name ?? ''}</small></div>
    <div><span>Melee</span><b>{v.attacks.melee}+</b></div>
    <div><span>Ranged</span><b>{v.attacks.ranged}+</b></div>
    <div><span>Carry</span><b>{v.carry.load} / {v.carry.capacity}</b><small>enc. over {v.carry.threshold}</small></div>
  </div>

  <div class="grid">
    <section>
      <h2>Abilities and saves</h2>
      <table>
        <tbody>
          {#each v.abilities as a}
            <tr><th>{a.name}</th><td class="num">{a.score}</td><td>Save vs. {a.save}</td><td class="num">{a.threshold}+</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Talents <small>(d6, * expertise)</small></h2>
      <table>
        <tbody>
          {#each v.talents as t}
            <tr><th>{t.name}{t.expert ? '*' : ''}</th><td class="num">{t.threshold}+</td><td class="use">{t.use}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Weapons</h2>
      <table>
        <tbody>
          {#each inv.weapons as w}
            <tr><th>{w.name}{held(w) ? ` (${held(w)})` : ''}</th><td>{damage(w)}</td><td>{w.size}{reach(w) ? `, ${reach(w)}` : ''}</td><td class="num">{w.shield ? '' : `${w.ranged ? v.attacks.ranged : v.attacks.melee}+`}</td></tr>
          {/each}
          {#each Array(Math.max(0, 3 - inv.weapons.length)) as _}<tr class="empty"><th>&nbsp;</th><td></td><td></td><td></td></tr>{/each}
        </tbody>
      </table>
    </section>

    <section>
      <h2>{v.cls.name} <small>{v.cls.book ?? v.c.rules.name} p. {v.cls.page}</small></h2>
      <ul class="features">
        {#each v.features as f}<li><b>{f.name}.</b> {f.summary}</li>{/each}
      </ul>
      {#if v.cls.martial}<p class="small">{v.cls.martial}.</p>{/if}
    </section>

    <section class="wide">
      <h2>Inventory</h2>
      <ul class="items">
        {#each inv.items as item}<li>{item}</li>{/each}
        {#each Array(Math.max(0, 6 - inv.items.length)) as _}<li class="empty">&nbsp;</li>{/each}
      </ul>
    </section>

    {#if v.cls.magic}
      <section>
        <h2>{v.cls.magic.prepared}s</h2>
        <table>
          <tbody>
            {#each inv.prepared as p}<tr><td class="box">{p.spent ? '☒' : '☐'}</td><td>{v.circle(p.circle)}</td><th>{p.magic}</th></tr>{/each}
            {#each Array(Math.max(0, 3 - inv.prepared.length)) as _}<tr class="empty"><td class="box">☐</td><td></td><th>&nbsp;</th></tr>{/each}
          </tbody>
        </table>
      </section>
      <section>
        <h2>{v.cls.magic.book}</h2>
        <table>
          <tbody>
            {#each inv.book as b}<tr><td>{v.circle(b.circle)}</td><th>{b.magic}</th></tr>{/each}
            {#if !inv.book.length}<tr class="empty"><td></td><th>&nbsp;</th></tr>{/if}
          </tbody>
        </table>
      </section>
    {/if}

    {#if data.followers.length}
      <section class="wide">
        <h2>Retinue</h2>
        <table>
          <thead><tr><th>Name</th><th>Kind</th><th>HP</th><th>Attitude</th><th>Traits and notes</th></tr></thead>
          <tbody>
            {#each data.followers as f}
              <tr>
                <th>{f.name}</th>
                <td>{f.kind === 'beast' ? `${f.hitDice} HD beast` : f.classId && v.c.rules.hasClass(f.classId) ? `L${f.level} ${f.origin && v.c.rules.hasOrigin(f.origin) ? v.c.rules.getOrigin(f.origin).name + ' ' : ''}${v.c.rules.getClass(f.classId).name}` : `L${f.level}`}</td>
                <td class="num">{f.hpMax}</td>
                <td>{f.attitude}</td>
                <td class="use">{[f.traits.join(', '), f.notes].filter(Boolean).join('. ')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    <section class="wide">
      <h2>Level history</h2>
      <table>
        <tbody>
          {#each v.levels as l}
            <tr>
              <th>Level {l.level}</th>
              <td>+{l.hp} HP</td>
              <td>{l.training.length ? `Trained ${l.training.map((t) => v.talents.find((x) => x.id === t)!.name).join(', ')}` : ''}</td>
              <td class="use">{l.feat ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="wide notes">
      <h2>Notes</h2>
      <p>{data.notes}</p>
    </section>
  </div>
  <footer>Materia Mundi Companion · {v.c.rules.name} rules</footer>
</article>

<style>
  .pg {
    background: #fffdf8;
    color: #1d1712;
    border: 1px solid #c9b896;
    border-radius: 6px;
    padding: 18px;
    font-size: 13px;
    line-height: 1.35;
  }
  header { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid #1d1712; padding-bottom: 10px; }
  .portrait { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; border: 1.5px solid #1d1712; }
  .who { flex: 1; min-width: 0; }
  h1 { font: 700 1.9em/1.1 Georgia, serif; margin: 0; }
  .sub { color: #5b4a36; }
  .brand { font: italic 700 1em Georgia, serif; color: #8a2e1f; text-align: right; }
  .vitals { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 10px 0; }
  .vitals div { border: 1.5px solid #1d1712; border-radius: 6px; padding: 4px 8px; display: flex; flex-direction: column; min-width: 0; }
  .vitals span { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.06em; color: #5b4a36; }
  .vitals b { font: 700 1.4em/1.2 Georgia, serif; white-space: nowrap; }
  .vitals small { font-size: 0.75em; color: #5b4a36; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .blank { display: inline-block; width: 2.4em; border-bottom: 1.5px solid #1d1712; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 10px 18px; }
  section { break-inside: avoid; min-width: 0; }
  h2 { font: 700 1.1em/1.3 Georgia, serif; margin: 0 0 4px; border-bottom: 1.5px solid #1d1712; }
  h2 small { font: 400 0.75em system-ui, sans-serif; color: #5b4a36; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 2px 4px; border-bottom: 1px solid #e2d6bd; vertical-align: top; }
  thead th { font-size: 0.8em; color: #5b4a36; font-weight: 600; }
  tbody th { font-weight: 600; }
  .num { text-align: right; font-family: Georgia, serif; font-weight: 700; white-space: nowrap; }
  .use { color: #5b4a36; font-size: 0.85em; }
  .box { width: 1.2em; }
  .empty th, .empty td, li.empty { border-bottom: 1px solid #c9b896; height: 1.5em; }
  ul { margin: 0; padding: 0; list-style: none; }
  .features li { margin-bottom: 3px; }
  .items { columns: 2; column-gap: 18px; }
  .items li { border-bottom: 1px solid #e2d6bd; padding: 2px 4px; break-inside: avoid; }
  .small { font-size: 0.85em; color: #5b4a36; margin: 4px 0 0; }
  .notes p { white-space: pre-wrap; min-height: 4em; margin: 0; }
  footer { margin-top: 12px; font-size: 0.75em; color: #7a6a55; text-align: right; }

  @media (min-width: 560px) {
    .grid { grid-template-columns: 1fr 1fr; }
    .wide { grid-column: 1 / -1; }
  }

  @media print {
    .pg { border: 0; border-radius: 0; padding: 0; background: #fff; font-size: 9.5pt; }
    .grid { grid-template-columns: 1fr 1fr; }
    .wide { grid-column: 1 / -1; }
    .portrait { width: 0.9in; height: 0.9in; }
  }
</style>
