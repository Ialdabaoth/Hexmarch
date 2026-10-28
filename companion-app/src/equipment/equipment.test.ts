import { describe, expect, it } from 'vitest';
import { RULESETS } from '../rules/rules';
import { EQUIPMENT, equipmentFile, resolve } from './equipment';

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

  it('has one armor kind of each type for characters', () => {
    expect(file.catalog().armor.map((a) => a.type).sort()).toEqual(['heavy', 'light', 'medium']);
  });
});

describe('rulesets', () => {
  it.each(RULESETS.map((r) => [r.id, r] as const))('%s uses an equipment file that exists', (_, r) => {
    expect(() => equipmentFile(r.options.equipment)).not.toThrow();
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
