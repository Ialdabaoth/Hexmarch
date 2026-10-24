import { describe, expect, it } from 'vitest';
import { Character, freshState, defaultTalents, quickFollower, talentThreshold } from './character';
import { createSheet, importFile, levelUp, readSheet } from './sheet';
import { rulesFor } from '../rules/rules';

const abilities = { con: -1, str: 0, dex: 2, int: 0, wis: -1, cha: 1 };

function holly() {
  const s = createSheet({
    name: 'Holly', origin: 'human', classId: 'scout', abilities, talentBase: defaultTalents(abilities), firstTraining: 'stealth'
  });
  levelUp(s, { training: 'stealth', hpRoll: 3 });
  s.followers.push(quickFollower(rulesFor('mm')));
  s.inventory.items = ['Light crossbow', 'Two daggers'];
  return s;
}

describe('character sheet', () => {
  it('is a chronicle with tallies and no derived values', () => {
    const s = holly();
    expect(s.abilities.con).toBe(-1);
    expect(s.abilities.dex).toEqual({ score: 2, agility: 1, finesse: 1 });
    expect(s.abilities.int).toEqual({ score: 0 });
    expect(s.abilities.wis).toEqual({ score: -1, alertness: -1 });
    expect(s.class.levelups).toEqual([
      { level: 1, hp: 5, stealth: 1 },
      { level: 2, hp: 3, stealth: 1 }
    ]);
    const json = JSON.stringify({ ...s, followers: [] });
    expect(json).not.toMatch(/"hpMax"|"talentBase"|"threshold"/);
    expect(s.class).not.toHaveProperty('level');
  });

  it('round-trips through a file', () => {
    const s = holly();
    const back = readSheet(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    expect(talentThreshold(new Character(back, freshState()), 'stealth')).toBe(3);
  });

  it('accepts a hand-written sheet', () => {
    const [s] = importFile({
      format: 'materia-mundi-character',
      name: 'Brother Aldric',
      origin: 'dwarf',
      class: { name: 'priest', levelups: [{ level: 1 }, { level: 2, hp: '+4', feat: 'Domain: Hearth' }] },
      abilities: { con: 1, str: 1, dex: { score: -1, stealth: '-' }, int: 0, wis: 0, cha: { score: 1, bearing: '+1' } }
    });
    const c = new Character(s, freshState());
    expect(c.level).toBe(2);
    expect(c.hpMax).toBe(11);
    expect(talentThreshold(c, 'bearing')).toBe(4);
    expect(talentThreshold(c, 'stealth')).toBe(6);
    expect(c.sheet.levels()[1].feat).toBe('Domain: Hearth');
  });

  it('keeps magic in the inventory', () => {
    const s = createSheet({ name: 'A', origin: 'human', classId: 'priest', abilities, talentBase: defaultTalents(abilities) });
    s.inventory.book.push({ magic: 'Bless', circle: 1 });
    s.inventory.prepared.push({ magic: 'Bless', circle: 1, spent: true });
    expect(readSheet(JSON.parse(JSON.stringify(s))).inventory.prepared).toEqual([{ magic: 'Bless', circle: 1, spent: true }]);
  });

  it('only accepts images as portraits', () => {
    const s = holly();
    expect(Object.keys(s).slice(4, 7)).toEqual(['name', 'portrait', 'origin']);
    const read = (portrait: string) => readSheet({ ...JSON.parse(JSON.stringify(s)), portrait }).portrait;
    expect(read('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    expect(read('https://example.com/holly.png')).toBe('https://example.com/holly.png');
    expect(read('javascript:alert(1)')).toBe('');
    expect(read('data:text/html;base64,AAAA')).toBe('');
  });

  it('explains bad files', () => {
    const base = { format: 'materia-mundi-character', name: 'X', origin: 'human', class: { name: 'warrior', levelups: [{ level: 1, hp: 8 }] }, abilities: { con: 0, str: 0, dex: 0, int: 0, wis: 0, cha: 0 } };
    expect(() => readSheet({ ...base, origin: 'orc' })).toThrow(/origin/);
    expect(() => readSheet({ ...base, abilities: { ...base.abilities, dex: { score: 0, agility: '*' } } })).toThrow(/agility/);
    expect(() => readSheet({ ...base, class: { name: 'warrior', levelups: [] } })).toThrow(/level 1/);
    expect(() => readSheet({ ...base, class: { name: 'warrior', levelups: [{ level: 1, hp: 8 }, { level: 2 }] } })).toThrow(/level 2 needs "hp"/);
  });
});
