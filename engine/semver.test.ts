import { describe, expect, it } from 'vitest';
import { bump, compare, maxSatisfying, satisfies } from './semver';

describe('versions', () => {
  it('sorts prereleases before the release (the road to 1.0, WORKFLOWS.md)', () => {
    const v = ['1.0.0', '1.0.0-beta', '0.5.9', '1.0.0-alpha.2', '1.0.0-alpha', '1.0.0-alpha.10'];
    expect(v.sort(compare)).toEqual(['0.5.9', '1.0.0-alpha', '1.0.0-alpha.2', '1.0.0-alpha.10', '1.0.0-beta', '1.0.0']);
  });
  it('names the kind of update', () => {
    expect(bump('1.0.1', '1.0.2')).toBe('patch');
    expect(bump('1.0.1', '1.1.0')).toBe('minor');
    expect(bump('1.1.0', '2.0.0')).toBe('major');
    expect(bump('0.4.10', '0.4.11')).toBe('patch');
    expect(bump('0.4.10', '0.5.0')).toBe('major'); // before 1.0 a minor can break
    expect(bump('1.0.0', '1.0.0')).toBe('none');
    expect(bump('1.1.0', '1.0.0')).toBe('downgrade');
  });
});

describe('ranges', () => {
  it('reads npm carets, including before 1.0', () => {
    expect(satisfies('1.4.2', '^1.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.0')).toBe(false);
    expect(satisfies('0.1.9', '^0.1')).toBe(true);
    expect(satisfies('0.2.0', '^0.1')).toBe(false);
    expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
    expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
  });
  it('reads tildes, comparisons, x-ranges, hyphens and alternatives', () => {
    expect(satisfies('1.2.9', '~1.2')).toBe(true);
    expect(satisfies('1.3.0', '~1.2')).toBe(false);
    expect(satisfies('2.0.0', '<2.0')).toBe(false);
    expect(satisfies('1.9.9', '>=1.2 <2')).toBe(true);
    expect(satisfies('1.5.0', '1.x')).toBe(true);
    expect(satisfies('3.0.0', '*')).toBe(true);
    expect(satisfies('1.5.0', '1.0.0 - 1.4.0')).toBe(false);
    expect(satisfies('3.1.0', '^1.0 || ^3.0')).toBe(true);
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
  });
  it('keeps prereleases out unless the range names one', () => {
    expect(satisfies('1.0.0-beta', '^1.0')).toBe(false);
    expect(satisfies('1.0.0-beta', '>=1.0.0-alpha')).toBe(true);
    expect(satisfies('2.0.0-alpha', '^1.0')).toBe(false);
  });
  it('picks the highest version that meets every range', () => {
    expect(maxSatisfying(['0.1.0', '0.1.4', '0.2.0'], ['^0.1'])).toBe('0.1.4');
    expect(maxSatisfying(['1.0.0', '1.3.0', '2.0.0'], ['^1.0', '<1.3'])).toBe('1.0.0');
    expect(maxSatisfying(['1.0.0'], ['^2.0'])).toBeNull();
  });
});
