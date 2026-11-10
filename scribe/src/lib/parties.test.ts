import { describe, expect, it } from 'vitest';
import { applyAtlas, atlasEvent, type State } from './parties';

const now = new Date('2026-11-10T16:00:00Z');
const base = 'https://x.test/data/';
const s0: State = { revision: 3, parties: [], active: '' };
const party = { id: 'red-hand', name: 'Red Hand', start: null, clock: { start: '3507-05-01', hours: 8 }, session: { number: 0, open: false }, at: null };

describe('Atlas events in Scribe', () => {
  it('checks what the Atlas sends', () => {
    expect(atlasEvent({ type: 'hexmarch-atlas', module: 'isle-of-mists', event: 'party', party: 'red-hand', hex: 'world:0101:0202', hours: 2 })).not.toBeNull();
    expect(atlasEvent({ type: 'hexmarch-atlas', module: 'isle-of-mists', event: 'party', party: 'Red Hand', hex: null, hours: 0 })).toBeNull();
    expect(atlasEvent({ type: 'other', module: 'x', event: 'active', party: 'a' })).toBeNull();
    expect(atlasEvent({ type: 'hexmarch-atlas', module: 'x', event: 'knowledge', ids: [], add: [], remove: [] })).toBeNull();
  });

  it('adds a party, makes it active, moves it and passes its clock', () => {
    const s1 = applyAtlas(s0, { event: 'party-new', module: 'isle-of-mists', party }, base, now);
    expect(s1.revision).toBe(4);
    expect(s1.active).toBe('red-hand');
    expect(applyAtlas(s1, { event: 'party-new', module: 'isle-of-mists', party }, base, now)).toBe(s1);
    const s2 = applyAtlas(s1, { event: 'party', module: 'isle-of-mists', party: 'red-hand', hex: 'world:0101:0202', hours: 3 }, base, now);
    expect(s2.parties![0].at).toEqual({ base, module: 'isle-of-mists', map: 'atlas', hex: 'world:0101:0202', label: '0101:0202', hours: 3 });
    expect(s2.parties![0].clock!.hours).toBe(11);
    expect(applyAtlas(s2, { event: 'party', module: 'isle-of-mists', party: 'red-hand', hex: 'world:0101:0202', hours: 3 }, base, now)).toBe(s2);
    const s3 = applyAtlas(s2, { event: 'party', module: 'isle-of-mists', party: 'red-hand', hex: null, hours: 0 }, base, now);
    expect(s3.parties![0].at).toBeNull();
    expect(s3.revision).toBe(6);
  });

  it('switches only to a party that exists', () => {
    const s1 = applyAtlas({ ...s0, parties: [party, { ...party, id: 'blue' }], active: 'red-hand' }, { event: 'active', module: 'm', party: 'blue' }, base, now);
    expect(s1.active).toBe('blue');
    expect(applyAtlas(s1, { event: 'active', module: 'm', party: 'nobody' }, base, now)).toBe(s1);
  });
});
