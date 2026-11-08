import { describe, expect, it } from 'vitest';
import { rulesFor } from '../rules/rules';
import { readSheet, writeSheet } from '../lib/sheet';
import { Character, freshState, saveThreshold } from '../lib/character';
import {
  applyAdjust, creatureFollower, damageRollEntry, newCreature, parseAttacks, reactionBands, reactionEntry, resolveTemplate,
  rollNpcSheet, saveTarget, sheetStats, TemplateError, type CreatureTemplate
} from './creature';

const MAX = () => 0.99; // every die shows its top face
const MIN = () => 0;

describe('attack lines', () => {
  it('splits the book line into attacks with damage', () => {
    expect(parseAttacks('bite (2d6+3 piercing), claws (3d6+3 sunder) x2')).toEqual([
      { name: 'bite', damage: '2d6+3', note: 'piercing' },
      { name: 'claws', damage: '3d6+3', note: 'sunder x2' }
    ]);
    expect(parseAttacks('bite (d6÷2 piercing)')[0]).toEqual({ name: 'bite', damage: 'd6÷2', note: 'piercing' });
    expect(parseAttacks('bite (1)')[0]).toEqual({ name: 'bite', damage: '1', note: '' });
    expect(parseAttacks('ranged 1d6 elemental (2 paces)')[0]).toEqual({ name: 'ranged elemental', damage: '1d6', note: '2 paces' });
    expect(parseAttacks('as mortal')).toEqual([]);
  });
});

describe('templates: start with X, then replace or adjust', () => {
  it('copies a bestiary entry', () => {
    const s = resolveTemplate({ from: 'mm:wolf-mastiff' });
    expect(s.name).toBe('Wolf / Mastiff');
    expect(s.ref).toBe('mm:wolf-mastiff');
    expect(s.saves.doom).toBe(11);
    expect(s.attacks.length).toBeGreaterThan(0);
  });

  it('replaces fields outright, including dotted ones', () => {
    const s = resolveTemplate({ from: 'mm:wolf-mastiff', replace: { name: 'Hound of Crom', level: 4, 'saves.fear': 9, attacks: ['bite (2d6 piercing)'] } });
    expect(s.name).toBe('Hound of Crom');
    expect(s.level).toBe(4);
    expect(s.saves.fear).toBe(9);
    expect(s.saves.doom).toBe(11);
    expect(s.attacks).toEqual([{ name: 'bite', damage: '2d6', note: 'piercing' }]);
  });

  it('adjusts numbers and lists relative to the template', () => {
    const base = resolveTemplate({ from: 'mm:wolf-mastiff' });
    const s = resolveTemplate({
      from: 'mm:wolf-mastiff',
      adjust: { level: 1, abilities: { str: 1 }, saves: { curse: -2 }, attacks: { add: [{ name: 'Howl', damage: '', note: 'fear' }] }, talents: { add: ['survival'] } }
    });
    expect(s.level).toBe(base.level + 1);
    expect(s.abilities.str).toBe(base.abilities.str + 1);
    expect(s.saves.curse).toBe((base.saves.curse ?? 0) - 2);
    expect(s.attacks.map((a) => a.name)).toContain('Howl');
    expect(s.talents).toEqual(['survival']);
    const fewer = resolveTemplate({ from: 'mm:wolf-mastiff', adjust: { attacks: { remove: [base.attacks[0].name] } } });
    expect(fewer.attacks.length).toBe(base.attacks.length - 1);
  });

  it('builds variants of other creatures, up to the depth limit', () => {
    const lib: Record<string, CreatureTemplate> = {
      hound: { from: 'mm:wolf-mastiff', replace: { name: 'Hound' } },
      'grey-hound': { from: 'hound', adjust: { level: 1 } },
      loop: { from: 'loop' }
    };
    const s = resolveTemplate({ from: 'grey-hound', replace: { name: 'Old Grey' } }, { creature: (id) => lib[id] });
    expect(s.name).toBe('Old Grey');
    expect(s.level).toBe(resolveTemplate({ from: 'mm:wolf-mastiff' }).level + 1);
    expect(() => resolveTemplate({ from: 'loop' }, { creature: (id) => lib[id] })).toThrow(TemplateError);
  });

  it('starts blank, and says what it cannot find', () => {
    expect(resolveTemplate({ from: 'blank', replace: { name: 'Athach' } }).name).toBe('Athach');
    expect(() => resolveTemplate({ from: 'mm:not-a-monster' })).toThrow(/No bestiary entry/);
    expect(() => resolveTemplate({ from: 'pc' })).toThrow(TemplateError);
    expect(() => applyAdjust({ name: 'x' }, { name: 1 }, '')).toThrow(/Can't add/);
  });
});

describe('creatures in play', () => {
  it('rolls hit points for each member of a troupe', () => {
    const c = newCreature({ from: 'mm:wolf-mastiff' }, 3, undefined, MAX);
    expect(c.hp).toHaveLength(3);
    expect(c.hp).toEqual(c.hpMax);
    expect(c.kind).toBe('beast');
    expect(c.owner).toBe('referee');
  });

  it('rolls damage, halving where the book says ÷2', () => {
    expect(damageRollEntry('Rat', { name: 'bite', damage: 'd6÷2', note: '' }, MAX).total).toBe(3);
    expect(damageRollEntry('Rat', { name: 'bite', damage: 'd6÷2', note: '' }, MIN).total).toBe(1);
    expect(damageRollEntry('Bat', { name: 'bite', damage: '1', note: '' }).total).toBe(1);
  });

  it('reads the reaction line as d6 bands', () => {
    expect(reactionBands('1-2 fearful, 3-5 wary, 6 aggressive')).toEqual([
      { lo: 1, hi: 2, result: 'fearful' }, { lo: 3, hi: 5, result: 'wary' }, { lo: 6, hi: 6, result: 'aggressive' }
    ]);
    expect(reactionEntry('Rat', '1-2 fearful, 3-5 wary, 6 aggressive', MAX).label).toBe('Reaction: aggressive');
  });

  it('takes the NPC talent threshold from the rules option', () => {
    const mm = rulesFor('mm');
    expect(mm.npcTalentThreshold(0)).toBe(5);
    expect(mm.npcTalentThreshold(4)).toBe(4);
    expect(mm.npcTalentThreshold(9)).toBe(2);
  });
});

describe('NPCs', () => {
  const mm = rulesFor('mm');

  it('builds a classed NPC, then levels it with replace', () => {
    const cls = mm.classes[0];
    const s = resolveTemplate({ from: `npc:${cls.id}`, replace: { level: 4, name: 'Sergeant' } }, { rules: mm });
    expect(s.name).toBe('Sergeant');
    expect(s.classId).toBe(cls.id);
    expect(s.level).toBe(4);
    expect(s.hp).toBe('per level');
    // Saves the book doesn't give come from ability + level, as for characters.
    expect(saveTarget(s, 'doom', mm)).toBe(mm.throw(s.abilities.con + 4));
    expect(saveTarget(s, 'fear', mm)).toBe(mm.throw(s.abilities.cha + 4));
    const c = newCreature({ from: `npc:${cls.id}`, replace: { level: 3 } }, 1, { rules: mm }, MIN);
    expect(c.kind).toBe('npc');
    expect(c.hpMax[0]).toBe(Math.max(1, 3 + 3 * (c.stats.abilities.con + (cls.hitDieBonus ?? 0))));
  });

  it('rolls a quick NPC from the table', () => {
    const s = resolveTemplate({ from: 'npc' }, { rules: mm, rng: MIN });
    expect(mm.hasClass(s.classId)).toBe(true);
    expect(Object.values(s.abilities).some((v) => v === 1)).toBe(true);
    expect(() => resolveTemplate({ from: 'npc' })).toThrow(/rules/);
    expect(() => resolveTemplate({ from: 'npc:not-a-class' }, { rules: mm })).toThrow(/no class/);
  });

  it('keeps bestiary saves and gives none it does not know', () => {
    const wolf = resolveTemplate({ from: 'mm:wolf-mastiff' });
    expect(saveTarget(wolf, 'doom', mm)).toBe(11);
    expect(saveTarget(resolveTemplate({ from: 'blank' }), 'doom', mm)).toBeUndefined();
  });

  it('rolls a full NPC sheet owned by the referee', () => {
    const sheet = rollNpcSheet(mm, 'leinster', MIN);
    expect(sheet.owner).toBe('referee');
    expect(sheet.campaign).toBe('leinster');
    const back = readSheet(JSON.parse(JSON.stringify(writeSheet(sheet))));
    expect(back.owner).toBe('referee');
    const ch = new Character(sheet, freshState());
    const s = resolveTemplate({ from: 'pc', sheet: sheet.id }, { sheet: (id) => (id === sheet.id ? sheetStats(ch) : undefined) });
    expect(s.name).toBe(sheet.name);
    expect(s.saves.doom).toBe(saveThreshold(ch, 'con'));
    expect(() => resolveTemplate({ from: 'pc', sheet: 'gone' }, { sheet: () => undefined })).toThrow(/No character sheet/);
  });

  it('moves one member of a troupe into a retinue', () => {
    const wolves = newCreature({ from: 'mm:wolf-mastiff' }, 2, undefined, MAX);
    wolves.notes = 'Found at the ford';
    const f = creatureFollower(wolves, 1);
    expect(f.kind).toBe('beast');
    expect(f.ref).toBe('mm:wolf-mastiff');
    expect(f.name).toBe('Wolf / Mastiff 2');
    expect(f.hp).toBe(wolves.hp[1]);
    expect(f.notes).toBe('Found at the ford');
    const one = newCreature({ from: 'mm:wolf-mastiff' }, 1);
    expect(creatureFollower(one).id).toBe(one.id);
  });
});
