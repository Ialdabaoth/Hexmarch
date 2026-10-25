import { describe, expect, it } from 'vitest';
import { checkPreparations } from './magic';

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
