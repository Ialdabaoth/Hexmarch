import { describe, expect, it } from 'vitest';
import { hexCentre, hexCentres, hexPoints, isAllowedBackground, newMap, parseHexJson, snapPoint, viewOf, SQUARE_CELL, HEX_RADIUS } from './maps';

const W = Math.sqrt(3) * HEX_RADIUS;

describe('parseHexJson', () => {
  it('accepts a minimal map', () => {
    const hj = parseHexJson('{"layout":"odd-r","hexes":{"A":{"q":0,"r":0},"B":{"q":1,"r":0}}}');
    expect(hj.layout).toBe('odd-r');
    expect(Object.keys(hj.hexes)).toEqual(['A', 'B']);
  });
  it('rejects unknown layouts, bad JSON and non-integer coordinates', () => {
    expect(() => parseHexJson('nope')).toThrow(/not valid JSON/);
    expect(() => parseHexJson({ layout: 'diagonal', hexes: { A: { q: 0, r: 0 } } })).toThrow(/layout/);
    expect(() => parseHexJson({ layout: 'odd-r', hexes: {} })).toThrow(/no hexes/);
    expect(() => parseHexJson({ layout: 'odd-r', hexes: { A: { q: 0.5, r: 0 } } })).toThrow(/whole-number/);
  });
});

describe('hexCentre', () => {
  it('shifts odd rows right for odd-r and even rows for even-r', () => {
    expect(hexCentre(0, 0, 'odd-r')).toEqual({ x: 0, y: 0 });
    expect(hexCentre(0, 1, 'odd-r').x).toBeCloseTo(W / 2);
    expect(hexCentre(0, 2, 'even-r').x).toBeCloseTo(W / 2);
    expect(hexCentre(0, 1, 'even-r').x).toBeCloseTo(0);
  });
  it('handles negative rows', () => {
    expect(hexCentre(0, -1, 'odd-r').x).toBeCloseTo(W / 2);
    expect(hexCentre(0, -1, 'odd-r').y).toBeCloseTo(-1.5 * HEX_RADIUS);
  });
  it('lays out flat-topped columns', () => {
    expect(hexCentre(1, 0, 'odd-q').x).toBeCloseTo(1.5 * HEX_RADIUS);
    expect(hexCentre(1, 0, 'odd-q').y).toBeCloseTo(W / 2);
  });
});

describe('hexPoints', () => {
  it('gives six corners', () => {
    expect(hexPoints(0, 0, true).split(' ')).toHaveLength(6);
  });
});

describe('snapPoint', () => {
  it('snaps squares to cell centres', () => {
    const m = newMap({ name: 'Room', kind: 'square' });
    expect(snapPoint(m, { x: 10, y: 79 })).toEqual({ x: SQUARE_CELL / 2, y: SQUARE_CELL + SQUARE_CELL / 2 });
  });
  it('snaps hexes to the nearest centre', () => {
    const hj = parseHexJson({ layout: 'odd-r', hexes: { A: { q: 0, r: 0 }, B: { q: 1, r: 0 } } });
    const m = newMap({ name: 'Hex', kind: 'hex', hexjson: hj });
    expect(snapPoint(m, { x: W - 5, y: 4 })).toEqual(hexCentre(1, 0, 'odd-r'));
    expect(hexCentres(hj)).toHaveLength(2);
  });
});

describe('viewOf', () => {
  it('covers a square map in cells', () => {
    expect(viewOf(newMap({ name: 'R', kind: 'square', cols: 4, rows: 3 }))).toEqual({ x: 0, y: 0, w: 160, h: 120 });
  });
  it('contains every hex', () => {
    const hj = parseHexJson({ layout: 'odd-r', hexes: { A: { q: -2, r: -2 }, B: { q: 2, r: 2 } } });
    const v = viewOf(newMap({ name: 'Hex', kind: 'hex', hexjson: hj }));
    for (const c of hexCentres(hj)) {
      expect(c.x).toBeGreaterThanOrEqual(v.x);
      expect(c.x).toBeLessThanOrEqual(v.x + v.w);
      expect(c.y).toBeGreaterThanOrEqual(v.y);
      expect(c.y).toBeLessThanOrEqual(v.y + v.h);
    }
  });
});

describe('isAllowedBackground', () => {
  it('allows https links and image data, not plain http or scripts', () => {
    expect(isAllowedBackground('https://example.com/map.png')).toBe(true);
    expect(isAllowedBackground('data:image/png;base64,AAAA')).toBe(true);
    expect(isAllowedBackground('')).toBe(true);
    expect(isAllowedBackground('http://example.com/map.png')).toBe(false);
    expect(isAllowedBackground('javascript:alert(1)')).toBe(false);
  });
});
