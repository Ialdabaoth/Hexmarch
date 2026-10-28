import { describe, expect, it } from 'vitest';
import { parse, roll } from './dice';

// Cycles through fixed die faces so results are predictable.
function faces(sides: number, values: number[]) {
  let i = 0;
  return () => (values[i++ % values.length] - 1) / sides;
}

describe('dice', () => {
  it('parses dice, keeps and modifiers', () => {
    expect(parse('4d6kh3 + d4 - 2')).toEqual({
      groups: [
        { count: 4, sides: 6, sign: 1, keep: { mode: 'kh', n: 3 } },
        { count: 1, sides: 4, sign: 1 }
      ],
      modifier: -2
    });
  });

  it('rejects junk', () => {
    expect(() => parse('')).toThrow();
    expect(() => parse('2d6 x')).toThrow();
    expect(() => parse('2d6 3')).toThrow();
    expect(() => parse('fish')).toThrow();
    expect(parse('(d6+1)×2')).toEqual({ groups: [{ count: 1, sides: 6, sign: 1 }], modifier: 1, multiplier: 2 });
    expect(roll('(2d6)x2', () => 0.99).total).toBe(24);
    expect(() => parse('3d6kh4')).toThrow();
  });

  it('keeps the highest dice', () => {
    const r = roll('4d6kh3', faces(6, [1, 5, 3, 6]));
    expect(r.total).toBe(14);
    expect(r.groups[0].kept).toEqual([false, true, true, true]);
  });

  it('applies signs and modifiers', () => {
    expect(roll('2d6-1', faces(6, [3, 4])).total).toBe(6);
    expect(roll('d20-d4', faces(20, [10])).total).toBeLessThan(20);
  });
});
