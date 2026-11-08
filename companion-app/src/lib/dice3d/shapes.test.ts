import { describe, expect, it } from 'vitest';
import { diceToShow, dot, shape, type DieKind } from './shapes';

const kinds: [DieKind, number[]][] = [
  [4, [1, 2, 3, 4]],
  [6, [1, 2, 3, 4, 5, 6]],
  [8, [1, 2, 3, 4, 5, 6, 7, 8]],
  [10, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
  ['tens', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
  [12, Array.from({ length: 12 }, (_, i) => i + 1)],
  [20, Array.from({ length: 20 }, (_, i) => i + 1)]
];

describe('3D dice shapes', () => {
  it.each(kinds)('d%s has one flat outward face per value', (kind, values) => {
    const s = shape(kind);
    expect([...s.up.keys()].sort((a, b) => a - b)).toEqual(values);
    for (const f of s.faces) {
      const d = dot(s.vertices[f.corners[0]], f.normal);
      expect(d).toBeGreaterThan(0);
      for (const c of f.corners) expect(dot(s.vertices[c], f.normal)).toBeCloseTo(d, 6);
      for (const [u, v] of f.uvs) {
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('puts opposite faces of a d6 and d20 at sides + 1', () => {
    for (const sides of [6, 20] as const) {
      const s = shape(sides);
      for (const f of s.faces) {
        const opposite = s.faces.find((g) => dot(g.normal, f.normal) < -0.999)!;
        expect(f.value + opposite.value).toBe(sides + 1);
      }
    }
  });

  it('turns a d100 into tens and units dice and skips sizes without a model', () => {
    expect(diceToShow([{ sides: 100, value: 47, kept: true }])).toEqual([
      { kind: 'tens', face: 4, kept: true },
      { kind: 10, face: 7, kept: true }
    ]);
    expect(diceToShow([{ sides: 100, value: 100, kept: true }]).map((d) => d.face)).toEqual([0, 0]);
    expect(diceToShow([{ sides: 10, value: 10, kept: false }])).toEqual([{ kind: 10, face: 0, kept: false }]);
    expect(diceToShow([{ sides: 3, value: 2, kept: true }, { sides: 20, value: 13, kept: true }])).toEqual([
      { kind: 20, face: 13, kept: true }
    ]);
  });
});
