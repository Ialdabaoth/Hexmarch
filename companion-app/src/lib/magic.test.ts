import { describe, expect, it } from 'vitest';
import { armorEffect, byCircle, checkPreparations, knownLimit, emptySlots } from './magic';

const STD = [[1], [2], [2, 1], [2, 2], [2, 2, 1], [2, 2, 2], [0, 3, 2, 1], [0, 2, 2, 2], [0, 0, 3, 2, 1]];
const c = (...circles: number[]) => circles.map((circle) => ({ circle }));

describe('checkPreparations', () => {
  it('allows what the level table allows', () => {
    expect(checkPreparations(STD, 3, c(1, 1, 2)).over).toEqual([]);
  });
  it('flags preparations beyond the count', () => {
    expect(checkPreparations(STD, 1, c(1, 1)).over).toEqual([1]);
  });
  it('flags circles above the level', () => {
    expect(checkPreparations(STD, 2, c(2)).over).toEqual([0]);
    expect(checkPreparations(STD, 2, c(2)).maxCircle).toBe(1);
  });
  it('lets lower circles fill higher slots', () => {
    // Level 7 has no first-circle slots, but first-circle magic fits in higher ones.
    expect(checkPreparations(STD, 7, c(1, 1, 1, 1, 1, 1)).over).toEqual([]);
    expect(checkPreparations(STD, 7, c(1, 1, 1, 1, 1, 1, 1)).over).toEqual([6]);
  });
  it('keeps the high slot for high magic', () => {
    expect(checkPreparations(STD, 3, c(1, 1, 2)).over).toEqual([]);
    expect(checkPreparations(STD, 3, c(1, 2, 2)).over).toEqual([2]);
  });
});

describe('wizard armor', () => {
  const MM = { light: [1, 1, 1, 1, 1], blockedBy: ['medium', 'heavy'] };
  const E9 = { light: [1, 1], blockedBy: ['medium', 'heavy', 'shield'] };
  it('light armor costs one of each circle (MM)', () => {
    const { penalty, blockedBy } = armorEffect(MM, 'light', false);
    expect(blockedBy).toBeUndefined();
    expect(checkPreparations(STD, 5, [], penalty).allowed).toEqual([1, 1, 0]);
  });
  it('light armor costs a first and second (E9)', () => {
    expect(checkPreparations(STD, 5, [], armorEffect(E9, 'light', false).penalty).allowed).toEqual([1, 1, 1]);
  });
  it('heavier armor or an E9 shield blocks casting', () => {
    expect(armorEffect(MM, 'heavy', false).blockedBy).toBe('heavy armor');
    expect(armorEffect(MM, undefined, true).blockedBy).toBeUndefined();
    expect(armorEffect(E9, undefined, true).blockedBy).toBe('a shield');
    expect(armorEffect(undefined, 'heavy', true)).toEqual({ penalty: [] });
  });
});

describe('knownLimit', () => {
  const KNOWN = [4, 6, 8, 10, 12, 15, 20, 30, null];
  it('follows the druid table', () => {
    expect(knownLimit(KNOWN, 1)).toBe(4);
    expect(knownLimit(KNOWN, 8)).toBe(30);
    expect(knownLimit(KNOWN, 9)).toBeNull();
    expect(knownLimit(undefined, 3)).toBeUndefined();
  });
});

describe('emptySlots', () => {
  it('lists the slots a level has left open, lowest circle first', () => {
    const slots = [[1], [2], [2, 1], [2, 2]];
    expect(emptySlots(checkPreparations(slots, 4, [{ circle: 1 }]))).toEqual([1, 2, 2]);
    expect(emptySlots(checkPreparations(slots, 4, [{ circle: 2 }, { circle: 1 }]))).toEqual([1, 2]);
    expect(emptySlots(checkPreparations(slots, 4, []))).toEqual([1, 1, 2, 2]);
  });
});

describe('byCircle', () => {
  it('orders by circle, keeping sheet indexes and the added order within a circle', () => {
    const list = [{ circle: 2, magic: 'a' }, { circle: 1, magic: 'b' }, { circle: 2, magic: 'c' }, { circle: 1, magic: 'd' }];
    expect(byCircle(list).map(({ entry, i }) => `${entry.magic}${i}`)).toEqual(['b1', 'd3', 'a0', 'c2']);
  });
});
