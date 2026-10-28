import { describe, expect, it } from 'vitest';
import { beastFollower } from '../lib/character';
import { BESTIARY, levelOf, rollHp } from './bestiary';

const MAX = () => 0.99; // every die shows its top face

describe('bestiary', () => {
  it('finds entries by reference, with their page', () => {
    const wolf = BESTIARY.get('mm:wolf-mastiff');
    expect(wolf?.name).toBe('Wolf / Mastiff');
    expect(wolf?.page).toBe(146);
    expect(wolf?.saves?.doom).toBe(11);
    expect(BESTIARY.get('mm:not-a-monster')).toBeUndefined();
  });

  it('keeps references unique', () => {
    const refs = BESTIARY.list().map((m) => m.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('offers animals and fey beasts with a fixed level as companions', () => {
    const names = BESTIARY.companions().map((m) => m.name);
    expect(names).toContain('Dire Wolf');
    expect(names).toContain('War Horse');
    expect(names).toContain('Pegasus');
    expect(names).not.toContain('Wraith');
    expect(names).not.toContain('Dragonborn');
    for (const m of BESTIARY.companions()) expect(levelOf(m)).toBeTypeOf('number');
  });

  it('reads a range by its low end', () => {
    expect(levelOf(BESTIARY.get('mm:wraith')!)).toBe(2);
    expect(levelOf(BESTIARY.get('mm:giant-rat')!)).toBe(0.5);
  });
});

describe('beast companions', () => {
  it('take their level and hit points from the book entry', () => {
    const beast = beastFollower(BESTIARY.get('mm:dire-wolf')!, MAX);
    expect(beast).toMatchObject({ kind: 'beast', name: 'Dire Wolf', ref: 'mm:dire-wolf', hitDice: 3 });
    expect(beast.hpMax).toBe((3 * 6 + 6) * 2);
    expect(beast.hp).toBe(beast.hpMax);
    expect(beast.abilities).toMatchObject({ con: 2, str: 3, dex: 1, int: -2, wis: 1, cha: 2 });
  });

  it('keeps the behaviour line and adjustments of animals', () => {
    const wolf = BESTIARY.get('mm:dire-wolf')!;
    expect(wolf.behavior).toBe('1 curious, 2-4 wary, 5-6 aggressive');
    expect(wolf.adjustments).toEqual({ con: 2, str: 3, dex: 1, int: -2, wis: 1, cha: 2 });
  });

  it('has a stat block for every animal and fey beast', () => {
    for (const m of BESTIARY.list().filter((x) => x.kind === 'animal' || x.kind === 'fey beast')) {
      expect(m.adjustments, m.name).toBeDefined();
      expect(m.behavior, m.name).toBeDefined();
    }
  });
});

describe('rollHp', () => {
  it('applies the multiplier and the divisor to the dice', () => {
    expect(rollHp('(3d6+6)x2', MAX)).toBe((3 * 6 + 6) * 2);
    expect(rollHp('(3d6+6)÷2', MAX)).toBe(Math.floor((3 * 6 + 6) / 2));
    expect(rollHp('4d6x2', MAX)).toBe(4 * 6 * 2);
  });

  it('leaves out structure points and brackets', () => {
    expect(rollHp('6d6 + 5 SP', MAX)).toBe(6 * 6);
    expect(rollHp('[2d6+10]', MAX)).toBe(2 * 6 + 10);
    expect(rollHp('7d6+9 + 2SP', MAX)).toBe(7 * 6 + 9);
  });

  it('never drops below one hit point', () => {
    expect(rollHp('3d6-3', () => 0)).toBe(1);
    expect(rollHp('1', MAX)).toBe(1);
  });
});
