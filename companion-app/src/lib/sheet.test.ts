import { describe, expect, it } from 'vitest';
import { Character, freshState, defaultTalents, quickFollower, talentThreshold } from './character';
import { createSheet, importFile, levelUp, readSheet, writeSheet } from './sheet';
import { rulesFor } from '../rules/rules';

const abilities = { con: -1, str: 0, dex: 2, int: 0, wis: -1, cha: 1 };

function holly() {
  const s = createSheet({
    name: 'Holly', origin: 'human', classId: 'scout', abilities, talentBase: defaultTalents(abilities), firstTraining: 'stealth'
  });
  levelUp(s, { training: 'stealth', hpRoll: 3 });
  s.followers.push(quickFollower(rulesFor('mm')));
  s.inventory.items = [{ id: 'i1', name: 'Light crossbow', qty: 1 }, { id: 'i2', name: 'Dagger', qty: 2 }];
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
    // Bless is in the Compendium's miracles: it gets a reference and its real circle.
    expect(readSheet(JSON.parse(JSON.stringify(s))).inventory.prepared).toEqual([{ ref: 'mm:bless', magic: 'Bless', circle: 2, spent: true }]);
  });

  it('keeps magic that is not in the equipment file as written', () => {
    const s = createSheet({ name: 'A', origin: 'human', classId: 'priest', abilities, talentBase: defaultTalents(abilities) });
    s.inventory.book.push({ magic: 'Saint Brendan\'s Blessing', circle: 3 });
    const back = readSheet(JSON.parse(JSON.stringify(writeSheet(s))));
    expect(back.inventory.book).toEqual([{ magic: "Saint Brendan's Blessing", circle: 3 }]);
  });

  it('saves a book reference without its circle unless the file leaves it open', () => {
    const s = createSheet({ name: 'D', origin: 'dwarf', classId: 'dweomersmith', abilities, talentBase: defaultTalents(abilities) });
    s.inventory.book.push({ magic: 'Earthbreaker', circle: 2 }, { magic: 'Mirror Shield', circle: 1 });
    const back = readSheet(JSON.parse(JSON.stringify(s)));
    // Earthbreaker comes in any rarity, so the sheet's choice stands; a Mirror Shield is always rare.
    expect(back.inventory.book).toEqual([
      { ref: 'mm:earthbreaker', magic: 'Earthbreaker', circle: 2 },
      { ref: 'mm:mirror-shield', magic: 'Mirror Shield', circle: 3 }
    ]);
    expect((writeSheet(back) as any).inventory.book).toEqual([
      { ref: 'mm:earthbreaker', magic: 'Earthbreaker', circle: 2 },
      { ref: 'mm:mirror-shield', magic: 'Mirror Shield' }
    ]);
    expect(readSheet(JSON.parse(JSON.stringify(writeSheet(back)))).inventory.book).toEqual(back.inventory.book);
  });

  it('only accepts images as portraits', () => {
    const s = holly();
    expect(Object.keys(s).slice(4, 7)).toEqual(['name', 'portrait', 'origin']);
    const read = (portrait: string) => readSheet({ ...JSON.parse(JSON.stringify(s)), portrait }).portrait;
    expect(read('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    expect(read('https://example.com/holly.png')).toBe('https://example.com/holly.png');
    expect(read('cache:3f2a9c')).toBe('cache:3f2a9c');
    expect(read('cache:../x')).toBe('');
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

describe('equipment references (format version 3)', () => {
  const w = { con: 0, str: 2, dex: 1, int: 0, wis: 0, cha: 0 };
  const warrior = () => createSheet({ name: 'W', origin: 'human', classId: 'warrior', abilities: w, talentBase: defaultTalents(w) });

  it('saves only the reference and what is unique to each item', () => {
    const s = warrior();
    s.inventory.weapons[0].bonus = 1;
    const saved = writeSheet(s) as any;
    expect(saved.version).toBe(3);
    expect(saved.inventory.weapons[0]).toEqual({ id: s.inventory.weapons[0].id, ref: 'mm:longsword', name: 'Longsword', bonus: 1 });
    expect(saved.inventory.armor[0]).toEqual({ id: s.inventory.armor[0].id, ref: 'mm:heavy-armor', name: 'Heavy armor' });
    expect(JSON.stringify(saved.inventory)).not.toMatch(/"size"|"encumbrance"|"properties"/);
  });

  it('fills the numbers back in from the equipment file', () => {
    const s = warrior();
    expect(readSheet(JSON.parse(JSON.stringify(writeSheet(s))))).toEqual(s);
  });

  it('gives a version 2 sheet references where its numbers match the file', () => {
    const [s] = importFile({
      format: 'materia-mundi-character', version: 2, rules: 'mm', name: 'Old', origin: 'human',
      class: { name: 'warrior', levelups: [{ level: 1 }] },
      abilities: { con: 0, str: 0, dex: 0, int: 0, wis: 0, cha: 0 },
      inventory: {
        armor: [{ id: 'a1', name: 'Mail', type: 'medium', encumbrance: 2 }],
        weapons: [
          { id: 'w1', name: 'Sword', type: 'Longsword', size: 'medium', properties: ['Parry'] },
          { id: 'w2', name: 'Big sword', type: 'Longsword', size: 'heavy', properties: ['Parry'] }
        ],
        items: ["Dungeoneer's kit", 'Lucky coin']
      }
    });
    expect(s.inventory.armor[0]).toMatchObject({ ref: 'mm:medium-armor', name: 'Mail' });
    expect(s.inventory.weapons[0].ref).toBe('mm:longsword');
    // Edited away from the file: kept as a custom weapon.
    expect(s.inventory.weapons[1].ref).toBeUndefined();
    expect(s.inventory.weapons[1].size).toBe('heavy');
    expect(s.inventory.items.map((i) => [i.ref, i.name])).toEqual([['mm:dungeoneers-kit', "Dungeoneer's kit"], [undefined, 'Lucky coin']]);
  });

  it('keeps a reference this device cannot find, with the numbers saved alongside it', () => {
    const [s] = importFile({
      format: 'materia-mundi-character', version: 3, rules: 'mm', name: 'Hansa', origin: 'human',
      class: { name: 'warrior', levelups: [{ level: 1 }] },
      abilities: { con: 0, str: 0, dex: 0, int: 0, wis: 0, cha: 0 },
      inventory: {
        weapons: [{ id: 'w1', ref: 'hansa:ordensschwert', name: 'Ordensschwert', type: 'Ordensschwert', size: 'heavy', encumbrance: 1 }],
        items: [{ id: 'i1', ref: 'hansa:seal', name: 'Seal of the Order', qty: 2 }]
      }
    });
    expect(s.inventory.weapons[0]).toMatchObject({ ref: 'hansa:ordensschwert', size: 'heavy', encumbrance: 1 });
    expect((writeSheet(s) as any).inventory.weapons[0].size).toBe('heavy');
    expect(s.inventory.items[0]).toEqual({ id: 'i1', ref: 'hansa:seal', name: 'Seal of the Order', qty: 2 });
  });
});

describe('magic items (item + dweomer)', () => {
  const sheetWith = (inventory: object) => importFile({
    format: 'materia-mundi-character', version: 3, rules: 'mm', name: 'M', origin: 'human',
    class: { name: 'warrior', levelups: [{ level: 1 }] },
    abilities: { con: 0, str: 0, dex: 0, int: 0, wis: 0, cha: 0 },
    inventory
  })[0];

  it('turns a written enchantment into a dweomer when the file has it', () => {
    const s = sheetWith({
      weapons: [
        { id: 'w1', type: 'Longsword', enchantment: 'Flametongue' },
        { id: 'w2', type: 'Dagger', enchantment: 'Blessed by Saint Olaf' }
      ]
    });
    expect(s.inventory.weapons[0].enchantment).toEqual({ ref: 'mm:flametongue', name: 'Flametongue', rarity: 'common' });
    expect(s.inventory.weapons[1].enchantment).toEqual({ name: 'Blessed by Saint Olaf' });
  });

  it('saves the rarity only when the dweomer leaves it open', () => {
    const s = sheetWith({
      weapons: [{ id: 'w1', ref: 'mm:shield', name: 'Shield', enchantment: { ref: 'mm:mirror-shield', rarity: 'common' } }],
      items: [{ id: 'i1', name: 'Ring of Elemental Power', enchantment: { ref: 'mm:ring-of-elemental-power', rarity: 'rare', charges: 3, quality: 'fair' } }]
    });
    const saved = writeSheet(s) as any;
    expect(saved.inventory.weapons[0].enchantment).toEqual({ ref: 'mm:mirror-shield', name: 'Mirror Shield' });
    expect(saved.inventory.items[0].enchantment).toEqual({ ref: 'mm:ring-of-elemental-power', name: 'Ring of Elemental Power', rarity: 'rare', charges: 3, quality: 'fair' });
    expect(readSheet(JSON.parse(JSON.stringify(saved)))).toEqual(s);
  });

  it('accepts a bare dweomer reference', () => {
    const s = sheetWith({ armor: [{ id: 'a1', type: 'heavy', enchantment: 'mm:orichalc-plate' }] });
    expect(s.inventory.armor[0].enchantment).toEqual({ ref: 'mm:orichalc-plate', name: 'Orichalc Plate' });
  });
});
