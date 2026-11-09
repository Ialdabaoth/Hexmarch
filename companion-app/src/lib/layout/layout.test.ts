import { describe, expect, it } from 'vitest';
import { LayoutError, keysIn, parseLayout } from './parse';
import { scopeCss } from './css';
import { has, lookup, show, truthy } from './values';
import { LAYOUTS, SURFACES, buildLayout, layoutFor } from './layouts';
import { sheetScope } from './sheet-scope';
import { sheetView } from '../render';
import { createSheet } from '../sheet';
import { defaultTalents } from '../character';

describe('layout markup', () => {
  it('reads the whitelist and the Companion elements', () => {
    const nodes = parseLayout(`
      <div class="row" data-print="never"><e9-portrait class="p"></e9-portrait>
        <h2>Hi <e9-value key="flavor.name"></e9-value></h2>
        <e9-each list="d.saves" as="s" max="6"><e9-roll check="save" key="s.id" e9-class="hot:s.low"><e9-value key="s.target" format="signed"></e9-value>+</e9-roll></e9-each>
        <e9-action do="hp" off="d.dead">HP</e9-action>
        <e9-if key="d.magic" not>No magic&nbsp;here</e9-if>
      </div>`);
    expect(nodes).toHaveLength(1);
    const div = nodes[0] as Extract<(typeof nodes)[0], { t: 'el' }>;
    expect(div).toMatchObject({ t: 'el', tag: 'div', cls: 'row', print: 'never' });
    expect(div.children.map((n) => n.t)).toEqual(['portrait', 'text', 'el', 'text', 'each', 'text', 'action', 'text', 'if']);
    expect(div.children[4]).toMatchObject({ t: 'each', list: 'd.saves', as: 's', max: 6 });
    expect(div.children[8]).toMatchObject({ t: 'if', key: 'd.magic', not: true, children: [{ t: 'text', text: 'No magic here' }] });
    expect(keysIn(nodes).map((k) => `${k.key}${k.local ? ' (local)' : ''}`)).toEqual(['flavor.name', 'd.saves', 's.id (local)', 's.low (local)', 's.target (local)', 'd.dead', 'd.magic']);
  });

  it('refuses anything that could run or reach out', () => {
    const bad = [
      '<script>alert(1)</script>',
      '<div onclick="x()">x</div>',
      '<a href="https://x">x</a>',
      '<img src="x">',
      '<div style="color:red">x</div>',
      '<iframe></iframe>',
      '<e9-roll check="eval" key="d.x">x</e9-roll>',
      '<e9-value key="constructor[0]"></e9-value>',
      '<e9-action do="delete">x</e9-action>',
      '<div>unclosed',
      '<div></span>'
    ];
    for (const b of bad) expect(() => parseLayout(b), b).toThrow(LayoutError);
  });
});

describe('layout css', () => {
  it('scopes rules and keeps @media print', () => {
    expect(scopeCss('.a .b > li, b.x:disabled { color: red; font: 700 2cqw/1 Georgia, serif }\n@media print { .a { display: none } }', '.lay-x')).toBe(
      '.lay-x .a .b > li, .lay-x b.x:disabled { color: red; font: 700 2cqw/1 Georgia, serif }\n@media print { .lay-x .a { display: none } }'
    );
  });

  it('refuses what could load or escape', () => {
    for (const bad of [
      '.a { background: url(https://x) }',
      '@import "x.css";',
      '.a { position: fixed }',
      '#id { color: red }',
      'body { color: red }',
      '.a::before { content: "x" }',
      '.a { font-family: Comic Sans }',
      '@font-face { font-family: x }'
    ]) expect(() => scopeCss(bad, '.s'), bad).toThrow(LayoutError);
  });
});

describe('named values', () => {
  it('reads dotted names from plain data only', () => {
    const scope = { d: { a: [1], n: 0, o: { b: 'x' } } };
    expect(lookup(scope, 'd.o.b')).toBe('x');
    expect(lookup(scope, 'd.o.toString')).toBeUndefined();
    expect(has(scope, 'd.n')).toBe(true);
    expect([truthy([]), truthy(0), truthy('x'), truthy([1])]).toEqual([false, false, true, true]);
    expect([show(2, 'signed'), show(-1, 'signed'), show({}), show(null)]).toEqual(['+2', '-1', '', '']);
  });
});

describe('the E9 layout', () => {
  const abilities = { con: 0, str: -1, dex: 0, int: 2, wis: 1, cha: 0 };
  const sheets = [
    createSheet({ name: 'Maeve', origin: 'human', classId: 'wizard', abilities, talentBase: defaultTalents(abilities) }),
    createSheet({ name: 'Holly', origin: 'human', classId: 'scout', abilities, talentBase: defaultTalents(abilities), firstTraining: 'stealth' }),
    createSheet({ rules: 'e9', name: 'Ash', origin: 'human', classId: 'fighter', abilities, talentBase: defaultTalents(abilities) })
  ];

  it('loads cleanly, with every surface', () => {
    const e9 = LAYOUTS['e9-core'];
    expect(e9.problems).toEqual([]);
    expect(Object.keys(e9.surfaces).sort()).toEqual([...SURFACES].sort());
    expect(e9.css).toContain('.lay-e9-core .face .name');
    for (const r of ['mm', 'e9', 'e9mm']) expect(layoutFor(r)?.module).toBe('e9-core');
  });

  it('uses only values the sheet and the engine provide', () => {
    for (const s of sheets) {
      for (const edit of [true, false]) {
        const scope = sheetScope(sheetView(s), { live: edit, edit });
        for (const nodes of Object.values(LAYOUTS['e9-core'].surfaces)) {
          for (const k of keysIn(nodes)) if (!k.local) expect(has(scope, k.key), `${s.name}: ${k.key}`).toBe(true);
        }
      }
    }
  });

  it('reports a broken layout instead of failing', () => {
    const l = buildLayout('x', { 'card-front.html': '<script></script>', 'cover.html': '' }, '.a { background: url(x) }');
    expect(l.problems).toHaveLength(3);
    expect(l.surfaces['card-front']).toBeUndefined();
  });
});
