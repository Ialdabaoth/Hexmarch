import { describe, expect, it } from 'vitest';
import { RULESETS, rulesFor } from '../rules/rules';
import { EQUIPMENT, equipmentFile, magicLevel, magicLevels, resolve } from './equipment';

// Guards hand edits to the files in this folder.
describe.each(EQUIPMENT.map((f) => [`${f.id}-equipment.json`, f] as const))('%s', (_, file) => {
  it('has a header and unique kebab-case ids', () => {
    expect(file.data.format).toBe('materia-mundi-equipment');
    expect(file.data.version).toBe(1);
    const ids = [...file.items, ...file.magic].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('names rulesets that exist', () => {
    for (const r of file.data.rules) expect(RULESETS.map((x) => x.id)).toContain(r);
  });

  it('items are complete for their kind', () => {
    for (const i of file.items) {
      expect(['armor', 'weapon', 'gear', 'mount', 'service'], i.id).toContain(i.kind);
      if (i.cost !== undefined) expect(i.cost, i.id).toBeGreaterThanOrEqual(0);
      if (i.kind === 'armor') {
        expect(['light', 'medium', 'heavy'], i.id).toContain(i.armorType);
        expect(i.defense, i.id).toBeGreaterThan(0);
      }
      if (i.kind === 'weapon') expect(['light', 'medium', 'heavy'], i.id).toContain(i.size);
    }
  });

  // A file of magic only (e9mm's revised weapons) sits behind a file with the armor.
  it.skipIf(!file.items.length)('has one armor kind of each type for characters', () => {
    expect(file.catalog().armor.map((a) => a.type).sort()).toEqual(['heavy', 'light', 'medium']);
  });
});

describe('rulesets', () => {
  it.each(RULESETS.map((r) => [r.id, r] as const))('%s uses an equipment file that exists', (_, r) => {
    for (const id of [r.options.equipment].flat()) expect(() => equipmentFile(id)).not.toThrow();
    expect(r.gear.weapons.length).toBeGreaterThan(0);
  });
});

describe('references', () => {
  it('resolve to entries', () => {
    expect(resolve('mm:longsword')?.name).toBe('Longsword');
    expect(resolve('e9:heavy-armor')).toMatchObject({ kind: 'armor', defense: 3 });
  });
  it('are undefined when the file or entry is missing', () => {
    expect(resolve('mm:no-such-thing')).toBeUndefined();
    expect(resolve('nowhere:longsword')).toBeUndefined();
    expect(resolve('longsword')).toBeUndefined();
  });
});

describe('mm magic', () => {
  const file = equipmentFile('mm');
  it('has spells, miracles, glamours and dweomers', () => {
    for (const system of ['arcane', 'divine', 'primal', 'dweomer']) expect(file.magic.some((m) => m.system === system), system).toBe(true);
  });
  it('entries are complete for their system', () => {
    for (const m of file.magic) {
      expect(m.page, m.id).toBeGreaterThan(0);
      expect(m.summary, m.id).toBeTruthy();
      if (m.system === 'dweomer') {
        expect(magicLevels(m).length, m.id).toBeGreaterThan(0);
        expect(['weapon', 'armor', 'shield', 'amulet', 'belt', 'boots', 'crown', 'ring', 'wondrous', 'potion'], m.id).toContain(m.form);
        if (m.base) expect(resolve(m.base), `${m.id} base`).toMatchObject({ kind: expect.any(String) });
      } else {
        expect(m.circle, m.id).toBeGreaterThanOrEqual(1);
        expect(m.circle, m.id).toBeLessThanOrEqual(5);
      }
    }
  });
  it('rarity counts as a level from 1 (common) to 4 (legendary)', () => {
    expect(magicLevel(resolve('mm:mirror-shield') as any)).toBe(3);
    expect(magicLevel(resolve('mm:earthbreaker') as any)).toBeUndefined();
    expect(magicLevels(resolve('mm:bag-of-holding') as any)).toEqual([2, 3, 4]);
    expect(magicLevel(resolve('mm:fireball') as any)).toBe(3);
  });
});

describe('E9 magic', () => {
  it('uses the Compendium spells until E9 has its own list', () => {
    expect(rulesFor('e9').equipment.findMagic('Fireball', 'arcane')?.ref).toBe('mm:fireball');
    expect(rulesFor('e9').gear.weapons.find((w) => w.type === 'Dagger')?.properties).toContain('Thrown 3/6/9');
  });
});
