import { describe, expect, it } from 'vitest';
import {
  addParty, blankParty, blankState, clockLabel, closeSession, inParty, moveParty, openSession, partyOf, passTime, readState, rulesLabel, setActive, setStart,
  withCharacters, withRules, writeState
} from './state';

const now = new Date('2026-11-08T12:00:00Z');
const at = (hex: string, hours = 0) => ({ base: 'https://x/', module: 'isle-of-mists', map: 'atlas', hex, label: hex.slice(6), hours });
const withKells = (campaign = '') => addParty(blankState(campaign, now), blankParty('p-kells', 'The Kells company'), now);

describe('campaign state', () => {
  it('starts with no parties; a party starts on 1 May 3507 at 08:00', () => {
    const s = blankState('', now);
    expect(s).toMatchObject({ format: 'hexmarch-campaign-state', version: 1, revision: 0, parties: [], active: '' });
    const k = withKells();
    expect(k.active).toBe('p-kells');
    expect(partyOf(k)).toMatchObject({ name: 'The Kells company', at: null, session: { number: 0, open: false } });
    expect(clockLabel(partyOf(k)!.clock)).toBe('1 May 3507, 08:00 (day 1)');
    expect(addParty(k, blankParty('p-kells', 'Again'), now)).toBe(k);
  });

  it('gives each party its own clock, across months and years', () => {
    let s = addParty(withKells(), blankParty('p-other', 'Others'), now);
    expect(s.active).toBe('p-other');
    s = passTime(s, 'p-kells', 24 * 30 + 5.5, now);
    expect(clockLabel(partyOf(s, 'p-kells')!.clock)).toBe('31 May 3507, 13:30 (day 31)');
    s = setStart(s, 'p-kells', '3507-12-31', now);
    expect(clockLabel(partyOf(s, 'p-kells')!.clock)).toBe('30 January 3508, 13:30 (day 31)');
    expect(clockLabel(partyOf(s, 'p-other')!.clock)).toBe('1 May 3507, 08:00 (day 1)');
    expect(passTime(s, 'nobody', 5, now)).toBe(s);
    expect(setActive(s, 'p-kells', now).active).toBe('p-kells');
    expect(setActive(s, 'nobody', now)).toBe(s);
  });

  it('moves a party and passes its travel time, without telling everyone where it went', () => {
    let s = moveParty(withKells(), 'p-kells', at('world:6947:25B2', 0), now);
    s = moveParty(s, 'p-kells', at('world:6947:25B3', 2.5), now);
    expect(partyOf(s)!.clock.hours).toBe(10.5);
    expect(s.revealed).toEqual({});
    // Resetting the Atlas's running time doesn't turn the clock back.
    s = moveParty(s, 'p-kells', at('world:6947:25B3', 0), now);
    expect(partyOf(s)!.clock.hours).toBe(10.5);
    expect(moveParty(s, 'p-kells', at('world:6947:25B3', 0), now)).toBe(s);
    expect(partyOf(moveParty(s, 'p-kells', null, now))!.at).toBeNull();
  });

  it("numbers each party's sessions", () => {
    let s = openSession(withKells(), 'p-kells', now);
    expect(openSession(s, 'p-kells', now)).toBe(s);
    s = openSession(closeSession(s, 'p-kells', now), 'p-kells', now);
    expect(partyOf(s)!.session).toEqual({ number: 2, open: true });
  });

  it('keeps players and parties when the character list changes; newcomers join the active party', () => {
    let s = withCharacters(withKells(), [{ id: 'a', name: 'Aldric' }], now);
    expect(s.characters).toEqual([{ id: 'a', name: 'Aldric', player: '', party: 'p-kells' }]);
    s = { ...s, characters: [{ id: 'a', name: 'Aldric', player: 'Dana', party: 'p-kells' }] };
    s = addParty(s, blankParty('p-other', 'Others'), now);
    s = withCharacters(s, [{ id: 'a', name: 'Aldric' }, { id: 'h', name: 'Holly' }], now);
    expect(s.characters).toEqual([{ id: 'a', name: 'Aldric', player: 'Dana', party: 'p-kells' }, { id: 'h', name: 'Holly', player: '', party: 'p-other' }]);
    expect(withCharacters(s, [{ id: 'a', name: 'Aldric' }, { id: 'h', name: 'Holly' }], now)).toBe(s);
    expect(inParty(s, 'h', 'p-kells', now).characters[1].party).toBe('p-kells');
    expect(inParty(s, 'h', 'nobody', now)).toBe(s);
    expect(withCharacters(blankState('', now), [{ id: 'a', name: 'A' }], now).characters[0].party).toBeNull();
  });

  it('reads its own files back and fills gaps', () => {
    const s = moveParty({ ...withKells('c1'), revealed: { 'isle-of-mists': { hexes: [], places: ['baile-atha-troim'] } } }, 'p-kells', at('world:6947:25B2', 1), now);
    const t = { ...s, parties: [{ ...partyOf(s)!, start: { module: 'isle-of-mists', id: 'arrive-at-the-keep' } }] };
    expect(readState(writeState(t), 'c1')).toEqual(t);
    const thin = readState({
      format: 'hexmarch-campaign-state', version: 1, active: 'gone',
      parties: [{ id: 'p-a', clock: { hours: -3 } }, { id: 'Bad Id' }, { id: 'p-a', name: 'twice' }],
      characters: [{ id: 'x', party: 'p-zzz' }],
      revealed: { 'isle-of-mists': { hexes: ['world:6947:25B2', 'nonsense'] } }
    }, 'c1');
    expect(thin.revealed['isle-of-mists']).toEqual({ hexes: ['world:6947:25B2'], places: [] });
    expect(thin.parties).toEqual([blankParty('p-a', 'p-a')]);
    expect(thin.active).toBe('p-a');
    expect(thin.characters).toEqual([{ id: 'x', name: '', player: '', party: null }]);
  });

  it('records the rules module', () => {
    const r = { ruleset: 'e9mm', module: 'mm-core', option: 'e9', version: '0.1.0' };
    const s = withRules(blankState('', now), r, now);
    expect(s.rules).toEqual(r);
    expect(withRules(s, { ...r }, now)).toBe(s);
    expect(rulesLabel(s.rules)).toBe('e9mm · mm-core › e9 0.1.0');
    expect(readState(writeState(s), '').rules).toEqual(r);
    expect(rulesLabel(null)).toBe('not recorded yet');
  });

  it('refuses other files', () => {
    expect(() => readState({ format: 'hexmarch-campaign' }, '')).toThrow(/isn't a campaign state/);
    expect(() => readState({ format: 'hexmarch-campaign-state', version: 2 }, '')).toThrow(/newer app/);
    expect(() => readState({ format: 'hexmarch-campaign-state', version: 1, campaign: 'other' }, 'c1')).toThrow(/another campaign/);
  });
});
