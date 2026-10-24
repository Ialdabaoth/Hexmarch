import { describe, expect, it } from 'vitest';
import {
  Character, freshState, attackThresholds, defaultTalents, quickFollower, rollAbilities, saveThreshold,
  talentSpreadValid, talentThreshold, xpToNext, zeroAbilities
} from './character';
import { createSheet, levelUp } from './sheet';
import { thresholdCheck } from './checks';
import { abilityFromRoll, maxFollowers, rulesFor } from '../rules/rules';

const mm = rulesFor('mm');
const e9 = rulesFor('e9');

const seq = (values: number[], sides = 6) => {
  let i = 0;
  return () => (values[i++ % values.length] - 1) / sides;
};

// Holly, the example Scout on p. 7.
const hollyAbilities = { con: -1, str: 0, dex: 2, int: 0, wis: 0, cha: 1 };
const hollySheet = () =>
  createSheet({
    name: 'Holly',
    origin: 'human',
    classId: 'scout',
    abilities: hollyAbilities,
    talentBase: defaultTalents(hollyAbilities),
    firstTraining: 'stealth'
  });

describe('rules', () => {
  it('converts 3d6 to abilities', () => {
    expect([3, 4, 8, 9, 12, 13, 16, 18].map(abilityFromRoll)).toEqual([-3, -2, -1, 0, 0, 1, 2, 3]);
  });

  it('rolls origins', () => {
    const origin = (...rolls: number[]) => mm.rollOrigin(() => rolls.shift()!).origin;
    expect(origin(2)).toBe('human');
    expect(origin(4)).toBe('barbarian');
    expect(origin(5)).toBe('dwarf');
    expect(origin(6, 2)).toBe('elf');
    expect(origin(6, 5)).toBe('gnome');
    expect(origin(6, 6)).toBe('beastfolk');
    expect(mm.rollOrigin(() => 6).steps.map((s) => s.table)).toEqual(['Origin', 'Fey type']);
  });

  it('matches the example sheet', () => {
    const c = new Character(hollySheet(), freshState());
    expect(attackThresholds(c)).toEqual({ melee: 14, ranged: 12 });
    expect(saveThreshold(c, 'con')).toBe(15);
    expect(saveThreshold(c, 'cha')).toBe(13);
    expect(c.hpMax).toBe(5);
    expect(talentThreshold(c, 'agility')).toBe(4);
    expect(talentThreshold(c, 'stealth')).toBe(4);
    expect(talentThreshold(c, 'bearing')).toBe(4);
  });

  it('gives fighters their hit die bonus', () => {
    expect(mm.startingHp('warrior', 0)).toBe(8);
    expect(mm.startingHp('delver', -1)).toBe(6);
    expect(mm.startingHp('wizard', -3)).toBe(3);
  });

  it('drops the lowest die for enhanced abilities', () => {
    const { abilities, rolls } = rollAbilities(mm.getOrigin('dwarf'), seq([1, 6, 6, 6]));
    expect(rolls.con).toHaveLength(4);
    expect(rolls.int).toHaveLength(3);
    expect(abilities.con).toBe(3);
  });

  it('validates talent spreads', () => {
    const a = { ...zeroAbilities(), dex: 2, wis: -1 };
    const base = defaultTalents(a);
    expect(talentSpreadValid(a, base)).toBe(true);
    expect(talentSpreadValid(a, { ...base, finesse: 5 })).toBe(false);
    expect(talentSpreadValid(a, { ...base, finesse: 5, stealth: 4 })).toBe(true);
  });

  it('levels up by adding to the chronicle', () => {
    const sheet = hollySheet();
    expect(xpToNext(new Character(sheet, freshState()))).toBe(2);
    const entry = levelUp(sheet, { training: 'stealth', hpRoll: 3 });
    expect(entry).toEqual({ level: 2, hp: 3, stealth: 1 });
    const c = new Character(sheet, freshState());
    expect(c.level).toBe(2);
    expect(c.hpMax).toBe(8);
    expect(talentThreshold(c, 'stealth')).toBe(3);
    expect(attackThresholds(c).ranged).toBe(11);
    expect(sheet.class.xp).toBe(1); // Dex +2 prime restarts XP at one
  });

  it('gives magic-users their scheduled training', () => {
    const a = zeroAbilities();
    const sheet = createSheet({ name: 'W', origin: 'human', classId: 'wizard', abilities: a, talentBase: defaultTalents(a) });
    expect(levelUp(sheet, { hpRoll: 2, training: 'stealth' })).toEqual({ level: 2, hp: 2, lore: 1 });
  });

  it('keeps damage when max HP grows', () => {
    const sheet = hollySheet();
    const state = { damage: 2, effects: [] };
    levelUp(sheet, { training: 'agility', hpRoll: 4 });
    const c = new Character(sheet, state);
    expect(c.sheet.hp()).toBe(9);
    expect(c.hp).toBe(7);
  });

  it('applies effects to live values only', () => {
    const c = new Character(hollySheet(), {
      damage: 0,
      effects: [
        { label: 'Potion of Might', target: 'str', amount: 1 },
        { label: 'Wet boots', target: 'stealth', amount: -1 },
        { label: 'Aid', target: 'hp', amount: 3 }
      ]
    });
    expect(c.str).toBe(1);
    expect(c.sheet.str()).toBe(0);
    expect(attackThresholds(c).melee).toBe(13);
    expect(c.sheet.save('str')).toBe(14);
    expect(talentThreshold(c, 'stealth')).toBe(5);
    expect(c.sheet.talent('stealth')).toBe(4);
    expect(c.hp).toBe(8);
    expect(c.sheet.hp()).toBe(5);
  });

  it('follows the follower table', () => {
    expect([6, 5, 4, 3, 2].map(maxFollowers)).toEqual([1, 2, 3, 4, 5]);
    const f = quickFollower(mm, seq([1, 1, 1, 2, 3], 20));
    expect(f.classId).toBe('warrior');
    expect(f.abilities.str).toBe(1);
  });
});

describe('E9 rules', () => {
  const sheet = (classId: string, a = { con: 0, str: 1, dex: 2, int: 0, wis: 0, cha: 0 }) =>
    createSheet({ rules: 'e9', name: 'Test', origin: 'human', classId, abilities: a, talentBase: defaultTalents(a), firstTraining: 'stealth' });

  it('rolls on the E9 origin table (p. 6)', () => {
    expect([2, 4, 5, 6].map((n) => e9.rollOrigin(() => n).origin)).toEqual(['human', 'elf', 'dwarf', 'gnome']);
    expect(e9.getOrigin('dwarf').enhanced).toEqual(['con', 'str']);
  });

  it('records the rules on the sheet', () => {
    const s = sheet('expert');
    expect(s.rules).toBe('e9');
    expect(new Character(s, freshState()).rules.name).toBe('E9');
  });

  it('only improves fighter attack throws with level (p. 11)', () => {
    const fighter = sheet('fighter');
    const expert = sheet('expert');
    for (const s of [fighter, expert]) {
      levelUp(s, { hpRoll: 3, training: 'agility' });
      levelUp(s, { hpRoll: 3, training: 'agility' });
    }
    const f = new Character(fighter, freshState());
    const x = new Character(expert, freshState());
    // Level 3, Str +1, Dex +2.
    expect(attackThresholds(f)).toEqual({ melee: 11, ranged: 10 });
    expect(attackThresholds(x)).toEqual({ melee: 13, ranged: 12 });
    expect(saveThreshold(x, 'dex')).toBe(10);
  });

  it('gives fighters 8 + Con and others 6 + Con (p. 5)', () => {
    expect(e9.startingHp('fighter', 1)).toBe(9);
    expect(e9.startingHp('priest', -1)).toBe(5);
  });

  it('lets experts train any talent at any level (p. 15)', () => {
    expect(e9.trainableAt(e9.getClass('expert'), 1)).toHaveLength(12);
    expect(mm.trainableAt(mm.getClass('scout'), 2)).toHaveLength(4);
    expect(mm.trainableAt(mm.getClass('scout'), 5)).toHaveLength(12);
  });

  it('rolls followers from the origin and class lists', () => {
    const f = quickFollower(e9, seq([1, 1, 2]));
    expect(f.origin).toBe('human');
    expect(e9.hasClass(f.classId)).toBe(true);
  });

  it('never goes below a 5+ throw', () => {
    expect(e9.throw(3 + 9)).toBe(5);
    expect(mm.throw(3 + 9)).toBe(5);
  });
});

describe('combined classes (E9 for Materia Mundi)', () => {
  const e9mm = rulesFor('e9mm');
  const a = { con: 1, str: 1, dex: 0, int: 1, wis: 1, cha: -1 };
  const dwarf = () =>
    createSheet({ rules: 'e9mm', name: 'Durin', origin: 'dwarf', classId: 'fighter+dweomersmith', abilities: a, talentBase: defaultTalents(a) });

  it('gives each origin its fixed class bundle', () => {
    expect(e9mm.getOrigin('dwarf').classes).toEqual(['fighter+dweomersmith']);
    expect(e9mm.getClass('champion+bard+druid').name).toBe('Champion / Bard / Druid');
    expect(e9mm.hasClass('hunter+druid')).toBe(true);
    expect(e9mm.hasClass('hunter+wizardry')).toBe(false);
  });

  it('levels every part together', () => {
    const s = dwarf();
    const cls = e9mm.getClass('fighter+dweomersmith');
    expect(cls.hitDieBonus).toBe(2);
    expect(cls.magic).toBeDefined();
    levelUp(s, { hpRoll: 4, feat: 'Cleave' });
    const c = new Character(s, freshState());
    // Fighter part: attack throws improve with level.
    expect(attackThresholds(c).melee).toBe(12);
    expect(c.sheet.levels()[1].feat).toBe('Cleave');
    expect(c.sheet.levels()[1].training.length).toBeGreaterThan(0);
  });

  it('uses the worst prime for experience', () => {
    const elfA = { ...zeroAbilities(), str: 1, cha: -1, wis: 1 };
    const s = createSheet({ rules: 'e9mm', name: 'Ael', origin: 'elf', classId: 'champion+bard+druid', abilities: elfA, talentBase: defaultTalents(elfA), firstTraining: 'lore' });
    expect(xpToNext(new Character(s, freshState()))).toBe(3);
  });
});

describe('checks', () => {
  it('uses the better die when easy and the worse when hard', () => {
    const easy = thresholdCheck({ who: 'x', label: 'y', sides: 20, threshold: 14, difficulty: 'easy' }, seq([5, 15], 20));
    expect(easy.total).toBe(15);
    expect(easy.outcome).toBe('success');
    const hard = thresholdCheck({ who: 'x', label: 'y', sides: 20, threshold: 14, difficulty: 'hard' }, seq([5, 15], 20));
    expect(hard.outcome).toBe('failure');
  });

  it('scores improved critical hits', () => {
    const r = thresholdCheck({ who: 'x', label: 'y', sides: 20, threshold: 9, difficulty: 'normal', improvedCritical: true }, seq([19], 20));
    expect(r.outcome).toBe('critical');
  });
});
