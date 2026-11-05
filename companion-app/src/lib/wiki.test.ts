import { describe, expect, it } from 'vitest';
import { RULESETS } from '../rules/rules';
import { wikiForCantrip, wikiForClass, wikiForEntry, wikiForMonster, WIKI_BASE } from './wiki';
import mmBestiary from '../bestiary/mm-bestiary.json';

describe('wiki links', () => {
  it('links equipment, magic, classes and creatures', () => {
    expect(wikiForEntry('mm:dagger')).toBe(`${WIKI_BASE}Weapons#dagger`);
    expect(wikiForClass('mm', 'warrior')).toBe(`${WIKI_BASE}Warrior`);
    expect(wikiForClass('e9mm', 'druid')).toBe(`${WIKI_BASE}Druid`);
    expect(wikiForMonster('mm:giant-rat')).toBe(`${WIKI_BASE}Bestiary-Animals#giant-rat`);
  });

  it('links cantrips by their base name', () => {
    expect(wikiForCantrip('Magic Missile (Fire)')).toBe(`${WIKI_BASE}Arcane-Spells#magic-missile`);
    expect(wikiForCantrip('Blade Ward')).toBe(`${WIKI_BASE}Arcane-Spells#cantrips`);
  });

  it('has nothing for custom entries', () => {
    expect(wikiForEntry('local:my-sword')).toBeNull();
    expect(wikiForMonster('nope')).toBeNull();
  });

  it('covers every built-in class and creature', () => {
    for (const r of RULESETS) for (const c of r.classes) expect(wikiForClass(r.id, c.id), `${r.id}:${c.id}`).not.toBeNull();
    for (const m of mmBestiary.monsters) expect(wikiForMonster(`mm:${m.id}`), m.id).not.toBeNull();
  });
});
