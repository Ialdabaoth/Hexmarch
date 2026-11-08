import { describe, expect, it } from 'vitest';
import { defaultTalents } from './character';
import { createSheet, importFile, isInParts, partsIn, readSheet, writeParts, writeSheet, type SheetData } from './sheet';

const abilities = { con: -1, str: 0, dex: 2, int: 0, wis: -1, cha: 1 };
const holly = () => {
  const s = createSheet({ name: 'Holly', origin: 'human', classId: 'scout', abilities, talentBase: defaultTalents(abilities), firstTraining: 'stealth' });
  s.notes = 'Owes the abbot';
  s.knowledge = [{ session: 3, module: 'isle-of-mists', place: 'crom-cave-g', how: 'scouted alone' }];
  return s;
};
const json = (o: unknown) => JSON.parse(JSON.stringify(o));

describe('character parts', () => {
  it('exports a whole character as four parts and reads it back', () => {
    const s = holly();
    const out = json(writeParts(s));
    expect(Object.keys(out)).toEqual(['format', 'version', 'id', 'rules', 'flavor', 'stats', 'gear', 'knowledge']);
    expect(out.flavor).toEqual({ name: 'Holly', portrait: '', notes: 'Owes the abbot' });
    expect(Object.keys(out.stats)).toEqual(['origin', 'class', 'abilities', 'followers']);
    expect(out.gear.weapons.length).toBeGreaterThan(0);
    expect(partsIn(out)).toEqual(['stats', 'gear', 'knowledge', 'flavor']);
    expect(readSheet(out)).toEqual(readSheet(json(writeSheet(s))));
  });

  it('updates only the parts a file holds', () => {
    const s = holly();
    const onDevice = (id: string): SheetData | undefined => (id === s.id ? s : undefined);
    const flavor = { ...json(writeParts(s, ['flavor'])), flavor: { name: 'Holly of Kells', portrait: '', notes: '' } };
    const knows = { ...json(writeParts(s, ['knowledge'])), knowledge: [{ session: 4, hex: 'world:6950:2611' }] };
    const [renamed] = importFile(flavor, onDevice);
    expect(renamed.name).toBe('Holly of Kells');
    expect(renamed.inventory).toEqual(readSheet(json(writeSheet(s))).inventory);
    expect(renamed.knowledge).toEqual(s.knowledge);
    const [learned] = importFile(knows, onDevice);
    expect(learned.knowledge).toEqual([{ session: 4, hex: 'world:6950:2611' }]);
    expect(learned.name).toBe('Holly');
  });

  it('needs the stats, or the character on the device, to make a character', () => {
    const gear = json(writeParts(holly(), ['gear', 'flavor']));
    expect(() => importFile(gear)).toThrow(/"Holly": this file holds only their gear and flavor/);
    const stats = json(writeParts(holly(), ['stats']));
    expect(importFile(stats)[0]).toMatchObject({ name: 'Unnamed', origin: 'human', knowledge: [] });
  });

  it('still reads flat sheets', () => {
    const flat = json(writeSheet(holly()));
    expect(isInParts(flat)).toBe(false);
    expect(readSheet(flat).knowledge).toEqual(holly().knowledge);
  });

  it('keeps only knowledge that points somewhere', () => {
    const s = readSheet({ ...json(writeSheet(holly())), knowledge: [{ session: 1 }, { note: ' a rumour ' }, 'x'] });
    expect(s.knowledge).toEqual([{ note: 'a rumour' }]);
  });
});
