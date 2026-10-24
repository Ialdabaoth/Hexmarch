// The rules engine shared by Materia Mundi and E9: abilities, talents, throws,
// attitudes. Each ruleset's origins, classes, origin roll tables and the few
// mechanics that differ live in JSON under options/ (mm-options.json and
// e9-options.json). A sheet records which ruleset built it.
// Page numbers in comments refer to the Materia Mundi Compendium unless noted.

import mmOptions from './options/mm-options.json';
import e9Options from './options/e9-options.json';
import e9mmOptions from './options/e9mm-options.json';

export type AbilityId = 'con' | 'str' | 'dex' | 'int' | 'wis' | 'cha';

export type TalentId =
  | 'agility' | 'finesse' | 'stealth'
  | 'lore' | 'medicine' | 'science'
  | 'alertness' | 'intuition' | 'survival'
  | 'bearing' | 'charm' | 'wit';

// Ids come from the ruleset's JSON, e.g. "human" or "warrior".
export type OriginId = string;
export type ClassId = string;

export type ClassKind = 'fighter' | 'expert' | 'magic-user';

export interface Ability {
  id: AbilityId;
  name: string;
  short: string;
  save: string;
  saveHint: string;
}

// Rolled in this order (p. 8).
export const ABILITIES: Ability[] = [
  { id: 'con', name: 'Constitution', short: 'Con', save: 'Doom', saveHint: 'disease or poison' },
  { id: 'str', name: 'Strength', short: 'Str', save: 'Hold', saveHint: 'knockdown or paralysis' },
  { id: 'dex', name: 'Dexterity', short: 'Dex', save: 'Blast', saveHint: 'a cone, ray, or explosion' },
  { id: 'int', name: 'Intelligence', short: 'Int', save: 'Trick', saveHint: 'illusion or beguilement' },
  { id: 'wis', name: 'Wisdom', short: 'Wis', save: 'Curse', saveHint: 'a magic spell' },
  { id: 'cha', name: 'Charisma', short: 'Cha', save: 'Fear', saveHint: 'morale checks' }
];

export interface Talent {
  id: TalentId;
  name: string;
  ability: AbilityId;
  use: string;
}

// p. 10 and p. 14.
export const TALENTS: Talent[] = [
  { id: 'agility', name: 'Agility', ability: 'dex', use: 'Climb, balance, precise athletics' },
  { id: 'finesse', name: 'Finesse', ability: 'dex', use: 'Pick locks, disarm traps, craft or repair' },
  { id: 'stealth', name: 'Stealth', ability: 'dex', use: 'Move silently, hide, ambush, pick pockets' },
  { id: 'lore', name: 'Lore', ability: 'int', use: 'Languages, codes, history, religion, culture' },
  { id: 'medicine', name: 'Medicine', ability: 'int', use: 'Elixirs and toxins, treat injury or disease' },
  { id: 'science', name: 'Science', ability: 'int', use: 'Potions, scrolls, magic items, engineering' },
  { id: 'alertness', name: 'Alertness', ability: 'wis', use: 'Spot traps and secret doors, avoid surprise' },
  { id: 'intuition', name: 'Intuition', ability: 'wis', use: 'Read intentions, sense danger' },
  { id: 'survival', name: 'Survival', ability: 'wis', use: 'Navigate, forage, track, make camp' },
  { id: 'bearing', name: 'Bearing', ability: 'cha', use: 'Composure, manage followers, morale' },
  { id: 'charm', name: 'Charm', ability: 'cha', use: "Sway a creature's attitude toward you" },
  { id: 'wit', name: 'Wit', ability: 'cha', use: 'Persuade, change behavior or beliefs' }
];

// 3d6 total to ability score (p. 9).
export function abilityFromRoll(total: number): number {
  if (total <= 3) return -3;
  if (total <= 5) return -2;
  if (total <= 8) return -1;
  if (total <= 12) return 0;
  if (total <= 15) return 1;
  if (total <= 17) return 2;
  return 3;
}

export const ABILITY_LABELS: Record<number, string> = {
  [-3]: 'Disabled',
  [-2]: 'Impaired',
  [-1]: 'Below Average',
  0: 'Average',
  1: 'Above Average',
  2: 'Exceptional',
  3: 'Prodigy'
};

export interface Origin {
  id: OriginId;
  name: string;
  height: string;
  enhanced: AbilityId[];
  deficient: AbilityId[];
  classes: ClassId[];
  note?: string;
}

export interface ClassFeature {
  name: string;
  level: number;
  summary: string;
}

export interface CharacterClass {
  id: ClassId;
  name: string;
  kind: ClassKind;
  page: number;
  prime: AbilityId;
  hitDieBonus: number;
  martial?: string;
  gear: string;
  // Experts: talents they may train at each level (all of them if left out),
  // and levels at which any talent may be trained.
  trainable?: TalentId[];
  anyTalentAt?: number[];
  // Fixed magic-user training at even levels.
  trainingSchedule?: Partial<Record<number, TalentId>>;
  expertise?: TalentId[];
  improvedCritical?: boolean;
  // Fighter feats to suggest at level-up.
  feats?: string[];
  features: ClassFeature[];
  // Magic-users: what holds their known magic and what each preparation is.
  magic?: { book: string; prepared: string; circleWord: string };
  // The book the page number points to, when it isn't the ruleset's own.
  book?: string;
  // Set on a combined class such as "fighter+dweomersmith": the classes it is made of.
  parts?: CharacterClass[];
}

// A combined class counts as every kind its parts are.
export function hasKind(cls: CharacterClass, kind: ClassKind): boolean {
  return (cls.parts ?? [cls]).some((p) => p.kind === kind);
}

export function primesOf(cls: CharacterClass): AbilityId[] {
  return [...new Set((cls.parts ?? [cls]).map((p) => p.prime))];
}

// Talents a magic-user part trains automatically at this level.
export function scheduledTraining(cls: CharacterClass, level: number): TalentId[] {
  return [...new Set((cls.parts ?? [cls]).map((p) => p.trainingSchedule?.[level]).filter((t): t is TalentId => !!t))];
}

// Several classes taken together, all leveling at once on one XP track. An origin
// lists one as "fighter+dweomersmith" to make it that origin's only class.
function combine(parts: CharacterClass[]): CharacterClass {
  const union = <T>(lists: (T[] | undefined)[]) => [...new Set(lists.flatMap((l) => l ?? []))];
  const experts = parts.filter((p) => p.kind === 'expert');
  const gear = new Map<string, string>();
  for (const p of parts) for (const g of p.gear.split(/,\s*/)) gear.set(g.toLowerCase(), g);
  return {
    id: parts.map((p) => p.id).join('+'),
    name: parts.map((p) => p.name).join(' / '),
    kind: parts[0].kind,
    page: parts[0].page,
    book: parts[0].book,
    prime: parts[0].prime,
    hitDieBonus: Math.max(...parts.map((p) => p.hitDieBonus)),
    // Proficiencies come from the first class listed, usually the fighter.
    martial: parts.find((p) => p.martial)?.martial,
    gear: [...gear.values()].join(', '),
    // Any expert part without a list may train anything.
    trainable: experts.some((p) => !p.trainable) ? undefined : union(experts.map((p) => p.trainable)),
    anyTalentAt: union(experts.map((p) => p.anyTalentAt)),
    expertise: union(parts.map((p) => p.expertise)),
    improvedCritical: parts.some((p) => p.improvedCritical),
    feats: union(parts.map((p) => p.feats)),
    features: parts.flatMap((p) => p.features.map((f) => ({ ...f, name: `${f.name} (${p.name})` }))),
    magic: parts.find((p) => p.magic)?.magic,
    parts
  };
}

export interface RollTableResult {
  min: number;
  max: number;
  // Either lands on an origin or sends you to roll on another table.
  origin?: OriginId;
  table?: string;
}

export interface RollTable {
  name: string;
  die: string;
  page?: number;
  results: RollTableResult[];
}

export interface OriginRollStep {
  table: string;
  die: string;
  roll: number;
}

export interface QuickNpcRow {
  max: number;
  class: ClassId;
  origin: OriginId;
  primes: AbilityId[];
}

export interface Mechanics {
  // "all": every class's attack throws improve with level (Materia Mundi).
  // "fighters": only fighters' do; everyone else uses ability alone (E9 p. 11).
  attackProgression: 'all' | 'fighters';
  // Best possible saving or attack throw threshold.
  throwMin: number;
  // E9: every medium ranged weapon takes both hands (p. 36). In Materia Mundi only the
  // shortbow does, and the catalog marks it.
  mediumRangedTwoHanded?: boolean;
}

export type ArmorType = 'light' | 'medium' | 'heavy';
export type WeaponSize = 'light' | 'medium' | 'heavy';

// A kind of armor from the ruleset's equipment chapter.
export interface ArmorKind {
  type: ArmorType;
  defense: number;
  encumbrance: number;
  properties: string[];
}

// A kind of weapon (or a shield) from the ruleset's equipment chapter.
export interface WeaponKind {
  type: string;
  size: WeaponSize;
  ranged?: boolean;
  // Paces: short range for ranged weapons, thrown range, or extra melee reach.
  range?: number;
  thrown?: number;
  reach?: number;
  twoHanded?: boolean;
  shield?: boolean;
  properties: string[];
  encumbrance: number;
}

export interface GearCatalog {
  page: number;
  armor: ArmorKind[];
  weapons: WeaponKind[];
}

export interface RulesetOptions {
  id: string;
  name: string;
  source: string;
  mechanics: Mechanics;
  gear: GearCatalog;
  originRoll: { start: string; tables: Record<string, RollTable> };
  origins: Origin[];
  classes: CharacterClass[];
  quickNpc?: { die: string; page?: number; note?: string; results: QuickNpcRow[] };
}

export class Ruleset {
  constructor(readonly options: RulesetOptions) {}

  get id() { return this.options.id; }
  get name() { return this.options.name; }
  get origins() { return this.options.origins; }
  get classes() { return this.options.classes; }
  get originRoll() { return this.options.originRoll; }
  get mechanics() { return this.options.mechanics; }
  get gear() { return this.options.gear; }

  armorKind(type: ArmorType): ArmorKind {
    return this.gear.armor.find((a) => a.type === type) ?? this.gear.armor[0];
  }

  // Case-insensitive, so "longsword" in a class's gear list finds "Longsword".
  weaponKind(type: string): WeaponKind | undefined {
    const t = type.trim().toLowerCase();
    return this.gear.weapons.find((w) => w.type.toLowerCase() === t);
  }

  private combined = new Map<string, CharacterClass>();

  hasClass(id: unknown): boolean {
    return typeof id === 'string' && id.split('+').every((part) => this.classes.some((c) => c.id === part));
  }
  hasOrigin(id: unknown): boolean {
    return this.origins.some((o) => o.id === id);
  }
  getClass(id: ClassId): CharacterClass {
    if (id.includes('+')) {
      if (!this.combined.has(id)) this.combined.set(id, combine(id.split('+').map((part) => this.getClass(part))));
      return this.combined.get(id)!;
    }
    const c = this.classes.find((x) => x.id === id);
    if (!c) throw new Error(`${this.name} has no class "${id}"`);
    return c;
  }
  getOrigin(id: OriginId): Origin {
    const o = this.origins.find((x) => x.id === id);
    if (!o) throw new Error(`${this.name} has no origin "${id}"`);
    return o;
  }

  // Saving throw threshold from ability + level (p. 10, E9 p. 11).
  throw(abilityPlusLevel: number): number {
    return Math.min(20, Math.max(this.mechanics.throwMin, 15 - abilityPlusLevel));
  }

  attack(classId: ClassId, ability: number, level: number): number {
    const improves = this.mechanics.attackProgression === 'all' || hasKind(this.getClass(classId), 'fighter');
    return this.throw(ability + (improves ? level : 1));
  }

  // Starting hit points: the maximum roll of the hit die, d6 + Con + class bonus.
  startingHp(classId: ClassId, con: number): number {
    return Math.max(1, 6 + con + this.getClass(classId).hitDieBonus);
  }

  hitDieLabel(classId: ClassId, con: number): string {
    const bonus = this.getClass(classId).hitDieBonus + con;
    return bonus === 0 ? 'd6' : `d6${bonus > 0 ? '+' : ''}${bonus}`;
  }

  trainableAt(cls: CharacterClass, level: number): TalentId[] {
    if (!hasKind(cls, 'expert')) return [];
    if (!cls.trainable || cls.anyTalentAt?.includes(level)) return TALENTS.map((t) => t.id);
    return cls.trainable;
  }

  // Rolls on the origin table, following any "roll on another table" results.
  rollOrigin(rollDie: (sides: number) => number): { origin: OriginId; steps: OriginRollStep[] } {
    const steps: OriginRollStep[] = [];
    let name = this.originRoll.start;
    for (let guard = 0; guard < 10; guard++) {
      const table = this.originRoll.tables[name];
      const roll = rollDie(dieSides(table.die));
      steps.push({ table: table.name, die: table.die, roll });
      const hit = table.results.find((r) => roll >= r.min && roll <= r.max);
      if (!hit) throw new Error(`${table.name} table has no result for ${roll}`);
      if (hit.origin) return { origin: hit.origin, steps };
      name = hit.table!;
    }
    throw new Error('Origin tables loop');
  }

  // A one-roll follower: the ruleset's quick NPC table if it has one, otherwise an
  // origin roll and a random class from that origin. Primes are +1.
  rollQuickNpc(rollDie: (sides: number) => number): { classId: ClassId; origin: OriginId; primes: AbilityId[] } {
    const table = this.options.quickNpc;
    if (table) {
      const n = rollDie(dieSides(table.die));
      const row = table.results.find((r) => n <= r.max) ?? table.results[table.results.length - 1];
      return { classId: row.class, origin: row.origin, primes: row.primes };
    }
    const origin = this.rollOrigin(rollDie).origin;
    const classes = this.getOrigin(origin).classes;
    const classId = classes[rollDie(classes.length) - 1];
    return { classId, origin, primes: primesOf(this.getClass(classId)) };
  }
}

function dieSides(die: string): number {
  return Number(die.replace(/^d/, ''));
}

export const RULESETS: Ruleset[] = [
  new Ruleset(mmOptions as RulesetOptions),
  new Ruleset(e9Options as RulesetOptions),
  new Ruleset(e9mmOptions as RulesetOptions)
];

export const DEFAULT_RULES = 'mm';

// Sheets saved before E9 support say "1e", the Compendium's first edition.
export function normalizeRulesId(id: unknown): string {
  return id === '1e' || id === undefined ? DEFAULT_RULES : String(id);
}

export function findRules(id: unknown): Ruleset | undefined {
  const n = normalizeRulesId(id);
  return RULESETS.find((r) => r.id === n);
}

export function rulesFor(id: unknown): Ruleset {
  const r = findRules(id);
  if (!r) throw new Error(`Unknown rules "${id}"`);
  return r;
}

// Maximum followers from Bearing threshold (p. 30, E9 p. 32): 6+ -> 1 ... 2+ -> 5.
export function maxFollowers(bearingThreshold: number): number {
  return Math.max(0, 7 - bearingThreshold);
}

export const ATTITUDES = ['Hostile', 'Unfriendly', 'Indifferent', 'Friendly', 'Helpful'] as const;
export type Attitude = (typeof ATTITUDES)[number];

// 2d6 attitude roll (p. 29).
export function attitudeFromRoll(total: number): Attitude {
  if (total <= 3) return 'Hostile';
  if (total <= 5) return 'Unfriendly';
  if (total <= 8) return 'Indifferent';
  if (total <= 10) return 'Friendly';
  return 'Helpful';
}

// Directing followers (p. 30): easy for Helpful, normal for Friendly, hard for Indifferent.
// Morale uses the same scale; worse attitudes are treated as hard.
export function loyaltyDifficulty(attitude: Attitude): Difficulty {
  if (attitude === 'Helpful') return 'easy';
  if (attitude === 'Friendly') return 'normal';
  return 'hard';
}

export type Difficulty = 'easy' | 'normal' | 'hard';

// Personality traits (p. 258): roll a d6 for the column, then a d6 for the trait.
export const NPC_TRAITS: string[][] = [
  ['Forgiving', 'Kind', 'Honorable', 'Cowardly', 'Cruel', 'Vindictive'],
  ['Naive', 'Optimistic', 'Hopeful', 'Doubtful', 'Pessimistic', 'Cynical'],
  ['Selfless', 'Generous', 'Fair', 'Shrewd', 'Selfish', 'Greedy'],
  ['Humble', 'Encouraging', 'Respectful', 'Condescending', 'Boastful', 'Arrogant'],
  ['Cowardly', 'Wary', 'Prudent', 'Honorable', 'Courageous', 'Foolhardy'],
  ['Bitter', 'Stern', 'Reserved', 'Excitable', 'Gentle', 'Sweet']
];
