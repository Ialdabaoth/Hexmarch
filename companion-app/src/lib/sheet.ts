// The character sheet: what gets saved and exported. Its data is a chronicle of how
// the character was made and what each level added, plus what a player writes on a
// paper sheet over time (XP, inventory, retinue, notes). Nothing derived from the
// rules is stored; the CharacterSheet class computes the permanent values
// (sheet.hp() is max HP, sheet.con() is permanent Con). The live Character in
// character.ts adds current HP and temporary boosts or debuffs on top.

import { rollDie, type Rng } from './dice';
import {
  type Enchantment, armorStats, compactArmor, compactItem, compactWeapon, defaultLoadout, itemId, matchesRef, newArmor, newItem, newWeapon, parseKit,
  weaponStats, type ArmorItem, type CarriedItem, type Hands, type WeaponItem
} from './gear';
import { DAMAGE_TYPES, RARITIES, magicLevel, magicLevels, resolveMagic, resolveItem, type MagicEntry, type MagicSystem, type Rarity } from '../equipment/equipment';
import {
  ABILITIES, DEFAULT_RULES, TALENTS, findRules, hasKind, normalizeRulesId, primesOf, rulesFor, scheduledTraining,
  type AbilityId, type Attitude, type ClassId, type OriginId, type Ruleset, type TalentId
} from '../rules/rules';

export const FORMAT = 'materia-mundi-character';
// Version 3 points items at equipment files ("ref": "mm:longsword") instead of copying
// their numbers. Version 2 made armor and weapons items with their own properties;
// version 1 had an armor rating and weapons as name, damage and melee/ranged. All load.
export const FORMAT_VERSION = 3;

// Changes are tallies keyed by what they change: "agility": 1 improves Agility one
// step (5+ to 4+), "agility": -1 worsens it, "hp": 3 adds hit points. A talent's
// threshold is 5 minus the sum of its tallies; max HP is the sum of the "hp" tallies.
// Usually 1 or -1; a combined class trained twice in one talent at one level records 2.
export type Tally = number;

export type AbilityEntry = { score: number } & Partial<Record<TalentId, Tally>>;

export type LevelupEntry = { level: number; hp: number; feat?: string } & Partial<Record<TalentId, Tally>>;

export type Abilities = Record<AbilityId, number>;

export type { ArmorItem, WeaponItem, CarriedItem, Hands };

// An entry in a spellbook, prayer book, craftbook or a druid's known glamours. `ref`
// points at the equipment file ("mm:fireball"); `magic` is its name, or anything written
// in. `circle` is the circle, or the rarity (1 common to 4 legendary) for dweomers.
export interface BookEntry {
  ref?: string;
  magic: string;
  circle: number;
}

// A physical preparation: a prayer strip, talisman, dweomer or prepared spell.
export interface Preparation {
  ref?: string;
  magic: string;
  circle: number;
  spent: boolean;
}

export interface Follower {
  id: string;
  name: string;
  kind: 'follower' | 'beast';
  classId?: ClassId;
  origin?: OriginId;
  level: number;
  abilities: Abilities;
  hitDice: number;
  hpMax: number;
  hp: number;
  attitude: Attitude;
  traits: string[];
  wage: string;
  notes: string;
}

export interface SheetData {
  format: typeof FORMAT;
  version: number;
  // Which ruleset built the character: "mm" (Materia Mundi) or "e9".
  rules: string;
  // The campaign the character was made for (its id), if any; see campaign.ts.
  campaign?: string;
  id: string;
  name: string;
  // An image: a data: URL (resized on the device) or an https:// link. Empty for none.
  portrait: string;
  origin: OriginId;
  class: {
    name: ClassId;
    xp: number;
    levelups: LevelupEntry[];
  };
  abilities: {
    con: number;
    str: number;
    dex: AbilityEntry;
    int: AbilityEntry;
    wis: AbilityEntry;
    cha: AbilityEntry;
  };
  inventory: {
    armor: ArmorItem[];
    weapons: WeaponItem[];
    // Ids of the armor being worn and the weapons in each hand; "" for none.
    worn: string;
    wielded: Hands;
    items: CarriedItem[];
    // Magic-users only. Preparations are physical objects, so they are inventory.
    book: BookEntry[];
    prepared: Preparation[];
  };
  followers: Follower[];
  notes: string;
}

export const TALENT_ABILITIES = ['dex', 'int', 'wis', 'cha'] as const;
type TalentAbility = (typeof TALENT_ABILITIES)[number];

const talentIds = new Set<string>(TALENTS.map((t) => t.id));

export function newId(): string {
  return crypto.randomUUID();
}

export function zeroAbilities(): Abilities {
  return { con: 0, str: 0, dex: 0, int: 0, wis: 0, cha: 0 };
}

export function abilityScore(data: SheetData, a: AbilityId): number {
  const v = data.abilities[a];
  return typeof v === 'number' ? v : v.score;
}

// Talent tallies in an ability or level-up entry.
export function tallies(entry: object): [TalentId, number][] {
  return Object.entries(entry).filter(([k, v]) => talentIds.has(k) && typeof v === 'number') as [TalentId, number][];
}

export interface LevelRecord {
  level: number;
  hp: number;
  training: TalentId[];
  feat?: string;
}

// Permanent values, read from the chronicle. Recreated whenever the data changes.
export class CharacterSheet {
  constructor(readonly data: SheetData) {}

  get id() {
    return this.data.id;
  }
  get classId(): ClassId {
    return this.data.class.name;
  }

  rules(): Ruleset {
    return rulesFor(this.data.rules);
  }

  level(): number {
    return Math.max(1, this.data.class.levelups.length);
  }

  // Max HP: the sum of the "hp" tallies.
  hp(): number {
    return Math.max(1, this.data.class.levelups.reduce((s, l) => s + l.hp, 0));
  }

  ability(a: AbilityId): number {
    return abilityScore(this.data, a);
  }
  con() { return this.ability('con'); }
  str() { return this.ability('str'); }
  dex() { return this.ability('dex'); }
  int() { return this.ability('int'); }
  wis() { return this.ability('wis'); }
  cha() { return this.ability('cha'); }

  abilities(): Abilities {
    return Object.fromEntries(ABILITIES.map((a) => [a.id, this.ability(a.id)])) as Abilities;
  }

  // Threshold from creation adjustments only.
  talentStart(t: TalentId): number {
    let v = 5;
    for (const a of TALENT_ABILITIES) for (const [id, n] of tallies(this.data.abilities[a])) if (id === t) v -= n;
    return v;
  }

  // Threshold after training: 5 minus every tally for this talent.
  talent(t: TalentId): number {
    let v = this.talentStart(t);
    for (const l of this.data.class.levelups) for (const [id, n] of tallies(l)) if (id === t) v -= n;
    return Math.min(6, Math.max(2, v));
  }

  talents(): Record<TalentId, number> {
    return Object.fromEntries(TALENTS.map((t) => [t.id, this.talent(t.id)])) as Record<TalentId, number>;
  }

  save(a: AbilityId): number {
    return this.rules().throw(this.ability(a) + this.level());
  }

  levels(): LevelRecord[] {
    return this.data.class.levelups.map((l) => ({
      level: l.level,
      hp: l.hp,
      training: tallies(l).flatMap(([t, n]) => Array<TalentId>(Math.max(0, n)).fill(t)),
      feat: l.feat
    }));
  }

  toJSON(): SheetData {
    return this.data;
  }
}

export interface DraftCharacter {
  rules?: string;
  campaign?: string;
  name: string;
  origin: OriginId;
  classId: ClassId;
  abilities: Abilities;
  // Starting talent thresholds after ability adjustments (6, 5 or 4).
  talentBase: Record<TalentId, number>;
  firstTraining?: TalentId;
}

export function createSheet(d: DraftCharacter): SheetData {
  const rules = rulesFor(d.rules ?? DEFAULT_RULES);
  const cls = rules.getClass(d.classId);
  const withTalents = (a: TalentAbility): AbilityEntry => ({
    score: d.abilities[a],
    ...Object.fromEntries(
      TALENTS.filter((t) => t.ability === a && d.talentBase[t.id] !== 5).map((t) => [t.id, d.talentBase[t.id] < 5 ? 1 : -1])
    )
  });
  // Experts train a talent at level one too (p. 11).
  const first: LevelupEntry = { level: 1, hp: rules.startingHp(d.classId, d.abilities.con) };
  if (hasKind(cls, 'expert') && d.firstTraining) first[d.firstTraining] = 1;
  const kit = parseKit(rules, cls.gear);
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    rules: rules.id,
    ...(d.campaign ? { campaign: d.campaign } : {}),
    id: newId(),
    name: d.name.trim() || 'Unnamed',
    portrait: '',
    origin: d.origin,
    class: { name: d.classId, xp: 0, levelups: [first] },
    abilities: {
      con: d.abilities.con,
      str: d.abilities.str,
      dex: withTalents('dex'),
      int: withTalents('int'),
      wis: withTalents('wis'),
      cha: withTalents('cha')
    },
    inventory: {
      ...kit,
      ...defaultLoadout(kit.armor, kit.weapons),
      book: [],
      prepared: []
    },
    followers: [],
    notes: ''
  };
}

export function rollHitDie(hitDieBonus: number, con: number, rng: Rng = Math.random): number {
  return Math.max(1, rollDie(6, rng) + con + hitDieBonus);
}

export interface LevelUpChoice {
  training?: TalentId;
  feat?: string;
  hpRoll?: number;
}

// Gaining a level (p. 12) adds an entry to the chronicle: the hit die rolled and
// any talent training. Prime +1 or better restarts XP at one.
export function levelUp(sheet: SheetData, choice: LevelUpChoice, rng: Rng = Math.random): LevelupEntry {
  const rules = rulesFor(sheet.rules);
  const cls = rules.getClass(sheet.class.name);
  const next = sheet.class.levelups.length + 1;
  const con = abilityScore(sheet, 'con');
  const entry: LevelupEntry = { level: next, hp: choice.hpRoll ?? rollHitDie(cls.hitDieBonus, con, rng) };
  // A combined class can do both: its expert part picks, its magic-user part trains on schedule.
  if (hasKind(cls, 'expert') && choice.training && rules.trainableAt(cls, next).includes(choice.training)) {
    entry[choice.training] = 1;
  }
  // Each class part that trains a talent this level counts, even the same talent twice.
  for (const t of scheduledTraining(cls, next)) entry[t] = (entry[t] ?? 0) + 1;
  const feat = choice.feat?.trim();
  if (feat) entry.feat = feat;
  sheet.class.levelups.push(entry);
  sheet.class.xp = primesOf(cls).every((p) => abilityScore(sheet, p) >= 1) ? 1 : 0;
  return entry;
}

// ---- Reading sheets from files -------------------------------------------------

export class SheetError extends Error {}

function fail(name: string, problem: string): never {
  throw new SheetError(`${name || 'A character'}: ${problem}`);
}

// Reads 1 / -1, or hand-typed "+", "+1", "-", "-1"; also 2 or 3 for training
// a combined class got from more than one of its classes at once.
export function parseTally(v: unknown): Tally | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (s === '+') return 1;
  if (s === '-') return -1;
  const m = /^([+-]?)([123])$/.exec(s);
  return m ? (m[1] === '-' ? -Number(m[2]) : Number(m[2])) : null;
}

// Reads 3, "3" or "+3".
function parseHp(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\+?\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Only images: a picture cached on the device, a web link, or (older sheets) an
// inline picture, which the app moves into its cache. Nothing that could run.
function portrait(v: unknown): string {
  if (typeof v !== 'string') return '';
  const p = v.trim();
  return /^cache:[\w-]+$/.test(p) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(p) || /^https:\/\/\S+$/.test(p) ? p : '';
}

const SIZES = ['light', 'medium', 'heavy'] as const;
const count = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : fallback);
const text = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function readArmor(rules: Ruleset, a: any): ArmorItem {
  const id = text(a?.id) || itemId();
  const bonus = count(a?.bonus);
  const enchantment = readEnchantment(rules, a?.enchantment);
  const entry = resolveItem(text(a?.ref));
  if (entry?.kind === 'armor') return { id, ref: a.ref, name: text(a?.name) || entry.name, ...armorStats(entry), bonus, ...(enchantment ? { enchantment } : {}) };
  // No reference, or one this device can't find: the sheet's own numbers.
  const type = SIZES.includes(a?.type) ? a.type : 'light';
  const { ref, ...base } = newArmor(rules, type, text(a?.name) || undefined);
  const encumbrance = count(a?.encumbrance, base.encumbrance);
  const keep = text(a?.ref) || (encumbrance === base.encumbrance ? ref : '');
  return { ...base, id, ...(keep ? { ref: keep } : {}), encumbrance, bonus, ...(enchantment ? { enchantment } : {}) };
}

function readWeapon(rules: Ruleset, w: any): WeaponItem {
  const id = text(w?.id) || itemId();
  const bonus = count(w?.bonus);
  const enchantment = readEnchantment(rules, w?.enchantment);
  const entry = resolveItem(text(w?.ref));
  if (entry?.kind === 'weapon') return { id, ref: w.ref, name: text(w?.name) || entry.name, ...weaponStats(entry), bonus, ...(enchantment ? { enchantment } : {}) };
  const base = newWeapon(rules, text(w?.type) || text(w?.name, 'Weapon'), text(w?.name) || undefined);
  const item: WeaponItem = {
    id,
    ...(text(w?.ref) ? { ref: text(w.ref) } : base.ref ? { ref: base.ref } : {}),
    name: base.name,
    type: base.type,
    size: SIZES.includes(w?.size) ? w.size : base.size,
    encumbrance: count(w?.encumbrance, base.encumbrance),
    reach: count(w?.reach, base.reach),
    range: count(w?.range, base.range),
    ranged: typeof w?.ranged === 'boolean' ? w.ranged : base.ranged,
    shield: typeof w?.shield === 'boolean' ? w.shield : base.shield,
    bonus,
    ...(enchantment ? { enchantment } : {}),
    properties: Array.isArray(w?.properties) ? w.properties.map(String) : base.properties
  };
  return item;
}

// Book entries and preparations: a ref into the equipment file, or a name that is matched
// against it (older sheets), or free text. A ref's circle or rarity comes from the file
// unless the entry can be made at several.
function readMagic(rules: Ruleset, system: MagicSystem | undefined, x: any): BookEntry {
  const given = text(x?.ref) || (/^[\w-]+:[\w-]+$/.test(text(x?.magic)) ? text(x.magic) : '');
  const named = given ? '' : text(x?.magic).trim();
  let ref = given;
  let found: MagicEntry | undefined = given ? resolveMagic(given) : undefined;
  const match = !given && named ? rules.equipment.findMagic(named, system) : undefined;
  if (match) [found, ref] = [match, match.ref];
  const stored = circle(x?.circle);
  if (!found) return { ...(ref ? { ref } : {}), magic: named || text(x?.name) || (ref ? ref : ''), circle: stored };
  const levels = magicLevels(found);
  return { ref, magic: named || text(x?.name) || found.name, circle: magicLevel(found) ?? (levels.includes(stored) ? stored : levels[0] ?? stored) };
}

function compactMagic<T extends BookEntry>(b: T): object {
  const entry = resolveMagic(b.ref);
  if (!entry) return b;
  const { circle: level, ...rest } = b;
  return magicLevel(entry) === undefined ? { ...rest, circle: level } : rest;
}

// Carried gear: a plain name (older sheets) or { id, ref, name, qty, enchantment }.
function readItem(rules: Ruleset, x: any): CarriedItem[] {
  if (typeof x === 'string') return x.trim() ? [newItem(rules, x)] : [];
  if (typeof x !== 'object' || x === null) return [];
  const ref = text(x.ref);
  const enchantment = readEnchantment(rules, x.enchantment);
  const name = text(x.name).trim() || resolveItem(ref)?.name || enchantment?.name;
  if (!name) return [];
  const qty = Math.max(1, count(x.qty, 1));
  const item: CarriedItem = ref ? { id: text(x.id) || itemId(), ref, name, qty } : { ...newItem(rules, name, qty), id: text(x.id) || itemId() };
  return [enchantment ? { ...item, enchantment } : item];
}

// A dweomer: { ref, rarity, charges, quality, cursed }, a bare ref ("mm:earthbreaker"),
// or free text (older sheets), which is matched against the equipment file's dweomers.
function readEnchantment(rules: Ruleset, v: unknown): Enchantment | undefined {
  const o: Record<string, any> = typeof v === 'string' ? (/^[\w-]+:[\w-]+$/.test(v.trim()) ? { ref: v.trim() } : { name: v }) : typeof v === 'object' && v ? v : {};
  let ref = text(o.ref);
  let entry: MagicEntry | undefined = ref ? resolveMagic(ref) : undefined;
  const written = text(o.name).trim();
  if (!ref && written) {
    const match = rules.equipment.findMagic(written, 'dweomer');
    if (match) [entry, ref] = [match, match.ref];
  }
  const name = written || entry?.name || ref;
  if (!name) return undefined;
  const e: Enchantment = { ...(ref ? { ref } : {}), name };
  const levels = entry ? magicLevels(entry) : [];
  const rarity = RARITIES.includes(o.rarity) ? (o.rarity as Rarity) : undefined;
  if (entry && magicLevel(entry) === undefined) e.rarity = rarity && levels.includes(RARITIES.indexOf(rarity) + 1) ? rarity : RARITIES[levels[0] - 1];
  else if (!entry && rarity) e.rarity = rarity;
  if (Number.isInteger(o.charges) && o.charges >= 0) e.charges = o.charges;
  if (['good', 'fair', 'poor'].includes(o.quality)) e.quality = o.quality;
  if (o.cursed === true) e.cursed = true;
  if (DAMAGE_TYPES.includes(o.element)) e.element = o.element;
  return e;
}

// Version 1 had armor as { rating, worn } and weapons as { name, damage, range };
// those become items, worn and wielded as before.
function readGear(rules: Ruleset, inv: any): Pick<SheetData['inventory'], 'armor' | 'weapons' | 'worn' | 'wielded'> {
  const legacy = inv.armor && !Array.isArray(inv.armor);
  const armor: ArmorItem[] = legacy
    ? Number(inv.armor.rating) > 0 || text(inv.armor.worn)
      ? [{ ...newArmor(rules, SIZES[Math.min(2, Math.max(1, Number(inv.armor.rating) || 1)) - 1], text(inv.armor.worn) || undefined) }]
      : []
    : (Array.isArray(inv.armor) ? inv.armor : []).map((a: any) => readArmor(rules, a));
  const weapons: WeaponItem[] = (Array.isArray(inv.weapons) ? inv.weapons : []).map((w: any) => {
    const item = readWeapon(rules, w);
    // A version-1 ranged weapon that isn't in the equipment list still shoots.
    if (!('type' in (w ?? {})) && w?.range === 'ranged' && !rules.weaponKind(item.type)) item.ranged = true;
    // A weapon whose numbers differ from its equipment file entry is custom.
    if (item.ref && resolveItem(item.ref) && !matchesRef(item)) delete item.ref;
    return item;
  });
  if (legacy || !Array.isArray(inv.wielded)) {
    const loadout = defaultLoadout(armor, weapons);
    return { armor, weapons, worn: armor[0]?.id ?? '', wielded: loadout.wielded };
  }
  const has = (list: { id: string }[], id: unknown) => (typeof id === 'string' && list.some((g) => g.id === id) ? id : '');
  const main = has(weapons, inv.wielded[0]);
  let off = has(weapons, inv.wielded[1]);
  // The same id in both hands means a medium weapon held two-handed; nothing else can be.
  if (off && off === main && weapons.find((w) => w.id === main)?.size !== 'medium') off = '';
  return { armor, weapons, worn: has(armor, inv.worn), wielded: [main, off] };
}

function circle(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : 1;
}

function blankFollowerFields(kind: Follower['kind']): Follower {
  return {
    id: newId(),
    name: kind === 'beast' ? 'Beast companion' : 'Follower',
    kind,
    level: 1,
    abilities: zeroAbilities(),
    hitDice: 1,
    hpMax: kind === 'beast' ? 4 : 6,
    hp: kind === 'beast' ? 4 : 6,
    attitude: 'Friendly',
    traits: [],
    wage: kind === 'beast' ? '' : '1 silver dinar/day + half share',
    notes: ''
  };
}

export { blankFollowerFields as blankFollower };

// Checks a sheet from a file (or storage) and returns a clean copy.
// Hand-written files may use "+"/"-" tallies and "+3" hit points.
export function readSheet(raw: unknown): SheetData {
  if (typeof raw !== 'object' || raw === null) throw new SheetError('This file has a character the app does not recognize');
  const f = raw as Record<string, any>;
  const name = typeof f.name === 'string' ? f.name : '';
  if (f.format !== FORMAT) fail(name, 'not a Materia Mundi character sheet');
  const rules = findRules(f.rules);
  if (!rules) fail(name, f.campaign ? `made for the campaign "${f.campaign}"; open its link in the Campaign tab first` : `unknown rules "${f.rules}"`);
  if (!rules.hasOrigin(f.origin)) fail(name, `${rules.name} has no origin "${f.origin}"`);
  if (!rules.hasClass(f.class?.name)) fail(name, `${rules.name} has no class "${f.class?.name}"`);
  const cls = rules.getClass(f.class.name);

  const scores = zeroAbilities();
  const abilities = {} as SheetData['abilities'];
  for (const a of ABILITIES) {
    const v = f.abilities?.[a.id];
    const n = typeof v === 'object' && v !== null ? v.score : v;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < -3 || n > 3) fail(name, `${a.name} must be a whole number from -3 to +3`);
    scores[a.id] = n;
    if (a.id === 'con' || a.id === 'str') {
      abilities[a.id] = n;
      continue;
    }
    const entry: AbilityEntry = { score: n };
    for (const [key, t] of Object.entries(typeof v === 'object' && v !== null ? v : {})) {
      if (key === 'score') continue;
      const step = parseTally(t);
      if (!talentIds.has(key) || step === null) fail(name, `can't read "${key}": ${JSON.stringify(t)} under ${a.name}; use a talent name with 1 or -1`);
      entry[key as TalentId] = step;
    }
    abilities[a.id as TalentAbility] = entry;
  }

  const given: unknown[] = Array.isArray(f.class.levelups) ? f.class.levelups : [];
  if (!given.length) fail(name, 'class.levelups needs at least the level 1 entry');
  if (given.length > 10) fail(name, 'more than 10 levels');
  const levelups: LevelupEntry[] = given.map((rawEntry, i) => {
    const r = (rawEntry ?? {}) as Record<string, unknown>;
    const level = i + 1;
    if (r.level !== undefined && r.level !== level) fail(name, `levelups are out of order at level ${level}`);
    const hp = r.hp === undefined && level === 1 ? rules.startingHp(cls.id, scores.con) : parseHp(r.hp);
    if (hp === null) fail(name, `level ${level} needs "hp" as a whole number, like 3`);
    const entry: LevelupEntry = { level, hp };
    for (const [key, t] of Object.entries(r)) {
      if (key === 'level' || key === 'hp') continue;
      if (key === 'feat') {
        if (typeof t === 'string' && t.trim()) entry.feat = t.trim();
        continue;
      }
      const step = parseTally(t);
      if (!talentIds.has(key) || step === null) fail(name, `can't read "${key}": ${JSON.stringify(t)} at level ${level}`);
      entry[key as TalentId] = step;
    }
    return entry;
  });

  const inv = f.inventory ?? {};
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    rules: normalizeRulesId(f.rules),
    ...(typeof f.campaign === 'string' && f.campaign ? { campaign: f.campaign } : {}),
    id: typeof f.id === 'string' && f.id ? f.id : newId(),
    name: name.trim() || 'Unnamed',
    portrait: portrait(f.portrait),
    origin: f.origin,
    class: { name: cls.id, xp: Number.isInteger(f.class.xp) && f.class.xp >= 0 ? f.class.xp : 0, levelups },
    abilities,
    inventory: {
      ...readGear(rules, inv),
      items: (Array.isArray(inv.items) ? inv.items : []).flatMap((x: unknown) => readItem(rules, x)),
      book: (Array.isArray(inv.book) ? inv.book : []).map((b: any) => readMagic(rules, cls.magic?.system, b)),
      prepared: (Array.isArray(inv.prepared) ? inv.prepared : []).map((p: any) => ({ ...readMagic(rules, cls.magic?.system, p), spent: p?.spent === true }))
    },
    followers: (Array.isArray(f.followers) ? f.followers : []).map((x: any) => {
      const base = blankFollowerFields(x?.kind === 'beast' ? 'beast' : 'follower');
      return { ...base, ...x, kind: base.kind, id: typeof x?.id === 'string' ? x.id : base.id, abilities: { ...base.abilities, ...x?.abilities } };
    }),
    notes: String(f.notes ?? '')
  };
}

// Accepts one sheet, a bundle from "Export all", or a plain array of sheets.
export function importFile(data: unknown): SheetData[] {
  const list = Array.isArray(data) ? data : (data as { characters?: unknown })?.characters ?? [data];
  if (!Array.isArray(list) || !list.length) throw new SheetError('No characters found in this file');
  return list.map(readSheet);
}

// The sheet as saved and exported: referenced items keep only their ref and what's
// unique to them.
export function writeSheet(d: SheetData): object {
  const inv = d.inventory;
  return {
    ...d,
    version: FORMAT_VERSION,
    inventory: {
      ...inv,
      armor: inv.armor.map(compactArmor),
      weapons: inv.weapons.map(compactWeapon),
      items: inv.items.map(compactItem),
      book: inv.book.map(compactMagic),
      prepared: inv.prepared.map(compactMagic)
    }
  };
}

export function exportBundle(list: SheetData[]) {
  return { format: 'materia-mundi-characters', version: FORMAT_VERSION, characters: list.map(writeSheet) };
}
