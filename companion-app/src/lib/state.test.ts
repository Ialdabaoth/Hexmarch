import { describe, expect, it } from 'vitest';
import { blankState, clockLabel, closeSession, moveParty, openSession, passTime, readState, setStart, withCharacters, writeState } from './state';

const now = new Date('2026-11-08T12:00:00Z');
const at = (hex: string, hours = 0) => ({ base: 'https://x/', module: 'isle-of-mists', map: 'atlas', hex, label: hex.slice(6), hours });

describe('campaign state', () => {
  it('starts on 1 May 3507 at 08:00', () => {
    const s = blankState('', now);
    expect(s).toMatchObject({ format: 'e9-campaign-state', version: 1, revision: 0, party: null, session: { number: 0, open: false } });
    expect(clockLabel(s)).toBe('1 May 3507, 08:00 (day 1)');
  });

  it('runs the clock across months and years', () => {
    let s = passTime(blankState('', now), 24 * 30 + 5.5, now);
    expect(clockLabel(s)).toBe('31 May 3507, 13:30 (day 31)');
    s = setStart(s, '3507-12-31', now);
    expect(clockLabel(s)).toBe('30 January 3508, 13:30 (day 31)');
    expect(s.revision).toBe(2);
  });

  it('moves the party, passes travel time and reveals the hex', () => {
    let s = moveParty(blankState('', now), at('world:6947:25B2', 0), now);
    s = moveParty(s, at('world:6947:25B3', 2.5), now);
    expect(s.clock.hours).toBe(10.5);
    expect(s.revealed['isle-of-mists'].hexes).toEqual(['world:6947:25B2', 'world:6947:25B3']);
    // Resetting the Atlas's running time doesn't turn the clock back.
    s = moveParty(s, at('world:6947:25B3', 0), now);
    expect(s.clock.hours).toBe(10.5);
    expect(moveParty(s, at('world:6947:25B3', 0), now)).toBe(s);
    expect(moveParty(s, null, now).party).toBeNull();
  });

  it('numbers sessions', () => {
    let s = openSession(blankState('', now), now);
    expect(openSession(s, now)).toBe(s);
    s = openSession(closeSession(s, now), now);
    expect(s.session).toEqual({ number: 2, open: true });
  });

  it('keeps players when the party list changes', () => {
    let s = withCharacters(blankState('', now), [{ id: 'a', name: 'Aldric' }], now);
    s = { ...s, characters: [{ id: 'a', name: 'Aldric', player: 'Dana' }] };
    s = withCharacters(s, [{ id: 'a', name: 'Aldric' }, { id: 'h', name: 'Holly' }], now);
    expect(s.characters).toEqual([{ id: 'a', name: 'Aldric', player: 'Dana' }, { id: 'h', name: 'Holly', player: '' }]);
    expect(withCharacters(s, [{ id: 'a', name: 'Aldric' }, { id: 'h', name: 'Holly' }], now)).toBe(s);
  });

  it('reads its own files back and fills gaps', () => {
    const s = moveParty(blankState('c1', now), at('world:6947:25B2', 1), now);
    expect(readState(writeState(s), 'c1')).toEqual(s);
    const thin = readState({ format: 'e9-campaign-state', version: 1, revealed: { 'isle-of-mists': { hexes: ['world:6947:25B2', 'nonsense'] } } }, 'c1');
    expect(thin.revealed['isle-of-mists']).toEqual({ hexes: ['world:6947:25B2'], places: [] });
    expect(thin.clock).toEqual({ start: '3507-05-01', hours: 8 });
  });

  it('refuses other files', () => {
    expect(() => readState({ format: 'materia-mundi-campaign' }, '')).toThrow(/isn't an E9 campaign state/);
    expect(() => readState({ format: 'e9-campaign-state', version: 2 }, '')).toThrow(/newer app/);
    expect(() => readState({ format: 'e9-campaign-state', version: 1, campaign: 'other' }, 'c1')).toThrow(/another campaign/);
  });
});
