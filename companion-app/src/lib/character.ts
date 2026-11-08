// The live character: the sheet's permanent values plus what is happening right now,
// such as damage taken and temporary boosts or debuffs. character.hp is current HP and
// character.sheet.hp() is max HP; character.con is Con with effects, character.sheet.con()
// is permanent Con. Recomputed whenever the sheet or the live state changes.

import { rollDie, type Rng } from './dice';
import type { DamagePart } from './checks';
import {
  ABILITIES, TALENTS, NPC_TRAITS,
  abilityFromRoll, primesOf, type AbilityId, type ClassId, type Origin, type OriginId, type Ruleset, type TalentId
} from '../rules/rules';
import { damage, defense, gearLoad, usesBothHands } from './gear';
import { Magic, damageTypeName, physicalType } from './magic-effects';
import { CharacterSheet, blankFollower, newId, zeroAbilities, type Abilities, type Follower, type SheetData } from './sheet';
import { levelOf, rollHp, type Monster, type WithRef } from '../bestiary/bestiary';

export { newId, zeroAbilities, blankFollower, type Abilities, type Follower };

export type EffectTarget = AbilityId | TalentId | 'hp';

// A temporary change: "+1 Str" from a potion, "-1 Stealth" from wet boots,
// "+3 hp" of temporary hit points. Talent amounts work like tallies: +1 improves.
export interface Effect {
  label: string;
  target: EffectTarget;
  amount: number;
}

// Saved on the device next to the sheet, but not part of the exported sheet.
export interface LiveState {
  damage: number;
  effects: Effect[];
}

export function freshState(): LiveState {
  return { damage: 0, effects: [] };
}

export class Character {
  readonly sheet: CharacterSheet;
  readonly rules: Ruleset;
  readonly id: string;
  readonly name: string;
  readonly origin: OriginId;
  readonly classId: ClassId;
  readonly level: number;
  readonly xp: number;
  // Current values, with effects applied.
  readonly abilities: Abilities;
  readonly talents: Record<TalentId, number>;
  readonly hpMax: number;
  readonly hp: number;
  // What the magic items worn, wielded and carried are doing.
  readonly magic: Magic;

  constructor(data: SheetData, readonly state: LiveState) {
    const sheet = (this.sheet = new CharacterSheet(data));
    this.rules = sheet.rules();
    this.id = data.id;
    this.name = data.name;
    this.origin = data.origin;
    this.classId = data.class.name;
    this.level = sheet.level();
    this.xp = data.class.xp;
    const bonus = (t: EffectTarget) => state.effects.filter((e) => e.target === t).reduce((s, e) => s + e.amount, 0);
    const magic = (this.magic = Magic.of(data.inventory));
    // Magic can lift an ability past +3.
    this.abilities = Object.fromEntries(
      ABILITIES.map((a) => [a.id, Math.min(6, Math.max(-3, Math.min(3, sheet.ability(a.id) + bonus(a.id))) + magic.amount(`ability:${a.id}`))])
    ) as Abilities;
    this.talents = Object.fromEntries(
      TALENTS.map((t) => [t.id, Math.min(6, Math.max(2, sheet.talent(t.id) - bonus(t.id) - magic.amount(`talent:${t.id}`)))])
    ) as Record<TalentId, number>;
    this.hpMax = sheet.hp() + magic.amount('hp');
    this.hp = this.hpMax - state.damage + bonus('hp');
  }

  get con() { return this.abilities.con; }
  get str() { return this.abilities.str; }
  get dex() { return this.abilities.dex; }
  get int() { return this.abilities.int; }
  get wis() { return this.abilities.wis; }
  get cha() { return this.abilities.cha; }

  get data(): SheetData {
    return this.sheet.data;
  }
}

// 3d6 in order; enhanced abilities drop the lowest of 4d6, deficient drop the highest (p. 8-9).
export function rollAbilities(o: Origin, rng: Rng = Math.random) {
  const abilities = zeroAbilities();
  const rolls: Partial<Record<AbilityId, number[]>> = {};
  for (const a of ABILITIES) {
    const enhanced = o.enhanced.includes(a.id);
    const deficient = o.deficient.includes(a.id);
    const dice = Array.from({ length: enhanced || deficient ? 4 : 3 }, () => rollDie(6, rng));
    const sorted = [...dice].sort((x, y) => x - y);
    const used = enhanced ? sorted.slice(1) : deficient ? sorted.slice(0, 3) : sorted;
    abilities[a.id] = abilityFromRoll(used.reduce((s, d) => s + d, 0));
    rolls[a.id] = dice;
  }
  return { abilities, rolls };
}

export function rollOrigin(rules: Ruleset, rng: Rng = Math.random) {
  return rules.rollOrigin((sides) => rollDie(sides, rng));
}

// Default talent spread: the first N linked talents move to 4+ (or 6+).
// The builder lets the player pick which ones instead.
export function defaultTalents(abilities: Abilities): Record<TalentId, number> {
  const base = {} as Record<TalentId, number>;
  for (const a of ABILITIES) {
    const linked = TALENTS.filter((t) => t.ability === a.id);
    const shift = Math.min(3, Math.abs(abilities[a.id]));
    linked.forEach((t, i) => {
      base[t.id] = i < shift ? (abilities[a.id] > 0 ? 4 : 6) : 5;
    });
  }
  return base;
}

// Checks that a talent spread matches the ability scores.
export function talentSpreadValid(abilities: Abilities, base: Record<TalentId, number>): boolean {
  return ABILITIES.every((a) => {
    const linked = TALENTS.filter((t) => t.ability === a.id);
    if (!linked.length) return true;
    const v = abilities[a.id];
    const target = v > 0 ? 4 : v < 0 ? 6 : 5;
    const moved = linked.filter((t) => base[t.id] === target).length;
    const rest = linked.filter((t) => base[t.id] === 5).length;
    return v === 0 ? rest === linked.length : moved === Math.min(3, Math.abs(v)) && moved + rest === linked.length;
  });
}

type Rated = Pick<Character, 'rules' | 'classId' | 'abilities' | 'level'>;

export function hitDieLabel(c: Pick<Character, 'rules' | 'classId' | 'abilities'>): string {
  return c.rules.hitDieLabel(c.classId, c.abilities.con);
}

export function saveThreshold(c: Pick<Character, 'rules' | 'abilities' | 'level'> & { magic?: Magic }, ability: AbilityId): number {
  const magic = c.magic?.amount(`save:${ability}`) ?? 0;
  return Math.max(c.rules.mechanics.throwMin, c.rules.throw(c.abilities[ability] + c.level) - magic);
}

// Melee uses Str, ranged uses Dex. In E9 only fighters add their level. Nothing adds
// to attack throws: masterwork and magic go to damage instead (Heph, 2026-10-28).
export function attackThresholds(c: Rated) {
  return {
    melee: c.rules.attack(c.classId, c.abilities.str, c.level),
    ranged: Math.max(c.rules.mechanics.throwMin, c.rules.attack(c.classId, c.abilities.dex, c.level))
  };
}

export function talentThreshold(c: Pick<Character, 'talents'>, talent: TalentId): number {
  return c.talents[talent];
}

export function effectTargetName(t: EffectTarget): string {
  if (t === 'hp') return 'HP';
  return ABILITIES.find((a) => a.id === t)?.short ?? TALENTS.find((x) => x.id === t)!.name;
}

export function hasExpertise(c: Pick<Character, 'rules' | 'classId'>, talent: TalentId): boolean {
  return c.rules.getClass(c.classId).expertise?.includes(talent) ?? false;
}

// Carrying capacity is 6 + Str; past half of it you're encumbered, past all of it
// burdened (p. 51). Load counts armor, heavy weapons, shields and polearms; the rest of
// the pack is up to the player.
export function carrying(c: Pick<Character, 'abilities' | 'data'>) {
  const capacity = 6 + c.abilities.str;
  const threshold = Math.floor(capacity / 2);
  const load = gearLoad(c.data.inventory.armor, c.data.inventory.weapons);
  return { capacity, threshold, load, encumbered: load > threshold, burdened: load > capacity };
}

const twice = (expr: string, yes: boolean) => (yes ? `(${expr})×2` : expr);

// What the character is wearing and wielding, and what that does in a fight, magic
// included. damage is a dice expression; damageTypes says what kind of harm it does.
export function equipment(c: Character) {
  const inv = c.data.inventory;
  const worn = inv.armor.find((a) => a.id === inv.worn);
  const main = inv.weapons.find((w) => w.id === inv.wielded[0]);
  const off = inv.weapons.find((w) => w.id === inv.wielded[1]);
  const bothHands = usesBothHands(main, inv.wielded);
  const attack = main?.ranged ? 'ranged' : 'melee';
  const kind = (c.magic.damageTypes() ?? [physicalType(main)]).map(damageTypeName).join(' or ');
  const extra = c.magic.extraDamage(attack).map((x) => ({ ...x, type: x.types.map(damageTypeName).join(' or ') }));
  // A firearm-style "equal" effect deals the weapon's damage again: the roll counts twice.
  const equal = extra.filter((x) => x.dice === 'equal');
  // Bonus dice from magic, rolled apart from the weapon's own (a keen blade's too).
  const dice = extra.filter((x) => x.dice !== 'equal');
  const bonus = c.magic.amount('damage', attack);
  const base = damage(main, bothHands ? undefined : off, bothHands, c.abilities.str) + (bonus ? `${bonus > 0 ? '+' : ''}${bonus}` : '');
  const set = c.magic.setDefense()?.amount ?? 0;
  return {
    worn,
    defense: Math.max(set, defense(c.rules, worn) + c.magic.amount('defense')),
    main,
    off: bothHands ? undefined : off,
    bothHands,
    // The same, kind by kind, for rolling.
    damageParts: [
      { expression: base, type: kind, ...(equal.length ? { equal: equal.map((x) => x.type) } : {}) },
      ...dice.map((x) => ({ expression: x.dice, type: x.type, bonus: true }))
    ] as DamagePart[],
    damage: twice(base + dice.map((x) => `+${x.dice}`).join(''), equal.length > 0),
    damageTypes: [kind, ...equal.map((x) => `equal ${x.type}`), ...dice.map((x) => `${x.dice} ${x.type}`)].join(', ')
  };
}

// Experience needed for the next level (p. 12): equal to that level,
// plus the penalty for a negative prime ability. A combined class uses its worst prime,
// and gains a level in every one of its classes at once, so it pays for each of them.
export function xpToNext(c: Rated): number {
  const cls = c.rules.getClass(c.classId);
  const prime = Math.min(...primesOf(cls).map((p) => c.abilities[p]));
  return (c.level + 1 + (prime < 0 ? -prime : 0)) * (cls.parts?.length ?? 1);
}

export function rollTraits(rng: Rng = Math.random): string[] {
  const traits: string[] = [];
  const used = new Set<number>();
  while (true) {
    const col = rollDie(6, rng) - 1;
    if (used.has(col)) break;
    used.add(col);
    const trait = NPC_TRAITS[col][rollDie(6, rng) - 1];
    if (!traits.includes(trait)) traits.push(trait);
  }
  return traits;
}

// A beast companion from the bestiary: its book level, ability adjustments and a rolled hit point total.
export function beastFollower(m: WithRef<Monster>, rng: Rng = Math.random): Follower {
  const hp = rollHp(m.hp, rng);
  return { ...blankFollower('beast'), name: m.name, ref: m.ref, abilities: { ...zeroAbilities(), ...m.adjustments }, hitDice: levelOf(m) ?? 1, hpMax: hp, hp };
}

// One-roll minion (p. 258), from the ruleset's quick NPC table.
export function quickFollower(rules: Ruleset, rng: Rng = Math.random): Follower {
  const row = rules.rollQuickNpc((sides) => rollDie(sides, rng));
  const abilities = zeroAbilities();
  for (const p of row.primes) abilities[p] = 1;
  const hp = rules.startingHp(row.classId, abilities.con);
  return {
    ...blankFollower('follower'),
    name: `${rules.getOrigin(row.origin).name} ${rules.getClass(row.classId).name}`,
    classId: row.classId,
    origin: row.origin,
    abilities,
    hpMax: hp,
    hp,
    traits: rollTraits(rng)
  };
}
