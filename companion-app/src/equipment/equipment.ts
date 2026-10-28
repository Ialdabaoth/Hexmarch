// Equipment files: catalogs of everything a character can own or know (armor, weapons,
// gear, and later magic). Sheets will point into them with references like
// "mm:longsword". The format is documented in EQUIPMENT_FORMAT.md.

import type { ArmorKind, ArmorType, GearCatalog, WeaponKind, WeaponSize } from '../rules/rules';
import mmEquipment from './mm-equipment.json';
import e9Equipment from './e9-equipment.json';

export type ItemKind = 'armor' | 'weapon' | 'gear' | 'mount' | 'service';

export interface EquipmentItem {
  id: string;
  name: string;
  kind: ItemKind;
  // In the file's currency; left out where the book gives no price.
  cost?: number;
  encumbrance?: number;
  page?: number;
  summary?: string;
  properties?: string[];
  // Armor.
  armorType?: ArmorType;
  defense?: number;
  // Armor for a mount, kept out of the character's armor list.
  barding?: boolean;
  // Weapons and shields.
  size?: WeaponSize;
  ranged?: boolean;
  range?: number;
  thrown?: number;
  reach?: number;
  shield?: boolean;
  // Gear: what one counts as ("quiver of 20"), and pockets for containers.
  stack?: string;
  slots?: number;
}

export type MagicSystem = 'arcane' | 'divine' | 'primal' | 'dweomer';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

// Spells (arcane), miracles (divine), glamours (primal) and dweomers: magic item
// blueprints and alchemical formulae, measured by rarity instead of circle.
export interface MagicEntry {
  id: string;
  name: string;
  system: MagicSystem;
  page?: number;
  summary?: string;
  // Schools, domains or glamour families, e.g. ["Flame", "Conjuration"].
  tags?: string[];
  circle?: number;
  cantrip?: string;
  // Cast as a reaction or alongside another action ("Fast -" in the book).
  fast?: boolean;
  // Dweomers: one rarity, or the ones it can be made at ("Any Rarity", "Uncommon+").
  rarity?: Rarity;
  rarities?: Rarity[];
  origins?: ('arcane' | 'primal' | 'divine')[];
  form?: 'weapon' | 'armor' | 'shield' | 'amulet' | 'belt' | 'boots' | 'crown' | 'ring' | 'wondrous' | 'potion';
  // The item it's usually built on, e.g. "mm:shield".
  base?: string;
  ingredients?: string[];
  // What it does in numbers, as far as the app can follow it (see MagicEffect).
  effects?: MagicEffect[];
}

// Damage types (Compendium p. 33 and p. 98). Physical damage is slashing, piercing or
// blunt, from the weapon's properties; armor reduces only physical and metal damage.
export const DAMAGE_TYPES = [
  'physical', 'metal', 'petrification', 'cold', 'acid', 'lightning', 'thunder', 'radiant', 'fire', 'poison', 'aetheric', 'psychic'
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
export const PHYSICAL = ['slashing', 'piercing', 'blunt'] as const;
export type PhysicalSubtype = (typeof PHYSICAL)[number];
// "physical:piercing"; "elemental" is an element picked when the item is made.
export type DamageKind = DamageType | `physical:${PhysicalSubtype}` | 'elemental';

// A number, or one that grows with the item's rarity: "rarity" is the rarity bonus
// (common +0 to legendary +3), "level" the rarity level (common 1 to legendary 4).
export type Amount = number | 'rarity' | 'level';

// Things a bonus can go to. Saves are named as in the book ("save:doom"); "save" alone
// is every save.
export type EffectTarget =
  | 'defense' | 'damage' | 'hp' | 'range' | 'save'
  | `ability:${string}` | `save:${string}` | `talent:${string}`;

interface EffectCommon {
  // A condition the app shows but doesn't check: "vs. unholy", "to hide".
  vs?: string;
  // Conditions the app checks: the armor worn, or the kind of attack.
  when?: { armor?: ('none' | 'light' | 'medium' | 'heavy')[]; attack?: 'melee' | 'ranged' };
  // For potions and other passing effects: how long it lasts.
  lasts?: string;
  times?: number;
}

export type MagicEffect = EffectCommon &
  (
    | { bonus: EffectTarget; amount: Amount }
    | { set: 'defense'; amount: Amount }
    // damage "equal": as much again as the weapon's own damage, of this type (Firearm).
    | { damage: string; type: DamageKind | DamageKind[]; per?: 'rarity' | 'level' }
    | { convert: DamageKind | DamageKind[] }
    | { resist: DamageKind | 'all'; mode: 'half' | 'immune' | 'vulnerable' | 'reduce' | 'armor'; amount?: Amount }
    | { easier: EffectTarget }
    | { harder: EffectTarget }
    | { text: string }
  );

// Circles 1-5, or rarity as 1 (common) to 4 (legendary), which is how preparation slots
// count them. Undefined when a dweomer can be made at several rarities.
export function magicLevel(e: MagicEntry): number | undefined {
  if (e.system !== 'dweomer') return e.circle;
  return e.rarity ? RARITIES.indexOf(e.rarity) + 1 : undefined;
}

export function magicLevels(e: MagicEntry): number[] {
  if (e.system !== 'dweomer') return e.circle ? [e.circle] : [];
  return (e.rarity ? [e.rarity] : e.rarities ?? RARITIES).map((r) => RARITIES.indexOf(r) + 1);
}

export interface EquipmentFileData {
  format: 'materia-mundi-equipment';
  version: number;
  id: string;
  name: string;
  // Rulesets this file is meant for.
  rules: string[];
  currency?: string;
  items: EquipmentItem[];
  magic: MagicEntry[];
}

export class EquipmentFile {
  private byId = new Map<string, EquipmentItem | MagicEntry>();

  constructor(readonly data: EquipmentFileData) {
    for (const e of [...data.items, ...data.magic]) this.byId.set(e.id, e);
  }

  get id() { return this.data.id; }
  get name() { return this.data.name; }
  get items() { return this.data.items; }
  get magic() { return this.data.magic; }

  get(id: string): EquipmentItem | MagicEntry | undefined {
    return this.byId.get(id);
  }

  ref(entry: { id: string }): string {
    return `${this.id}:${entry.id}`;
  }

  // The character-facing armor and weapon lists, in the shape the gear rules use.
  catalog(): GearCatalog {
    return gearCatalog(this.items);
  }
}

function gearCatalog(items: EquipmentItem[]): GearCatalog {
  const armor = items.filter((i) => i.kind === 'armor' && !i.barding);
  const weapons = items.filter((i) => i.kind === 'weapon');
  return {
    page: armor[0]?.page ?? weapons[0]?.page ?? 0,
    armor: armor.map(
      (i): ArmorKind => ({ type: i.armorType!, defense: i.defense ?? 0, encumbrance: i.encumbrance ?? 0, properties: i.properties ?? [] })
    ),
    weapons: weapons.map((i): WeaponKind => {
      const w: WeaponKind = { type: i.name, size: i.size!, properties: i.properties ?? [], encumbrance: i.encumbrance ?? 0 };
      for (const k of ['ranged', 'range', 'thrown', 'reach', 'shield'] as const) if (i[k]) (w as any)[k] = i[k];
      return w;
    })
  };
}

export type WithRef<T> = T & { ref: string };

// The equipment files a ruleset or campaign uses, in priority order. Armor comes from
// the first file only (armor types are a rule), and weapons from the first file plus
// any custom ones, so a ruleset's own arms list stays as the book has it. Other gear
// and magic come from all of them, the first file winning on a name.
export class Catalog {
  readonly items: WithRef<EquipmentItem>[];
  readonly magic: WithRef<MagicEntry>[];

  constructor(readonly files: EquipmentFile[]) {
    const items = new Map<string, WithRef<EquipmentItem>>();
    const magic = new Map<string, WithRef<MagicEntry>>();
    files.forEach((f, i) => {
      for (const it of f.items) {
        if (i > 0 && (it.kind === 'armor' || (it.kind === 'weapon' && BUILT_IN.has(f.id)))) continue;
        const key = `${it.kind}:${it.name.toLowerCase()}`;
        if (!items.has(key)) items.set(key, { ...it, ref: f.ref(it) });
      }
      for (const m of f.magic) {
        const key = `${m.system}:${m.name.toLowerCase()}`;
        if (!magic.has(key)) magic.set(key, { ...m, ref: f.ref(m) });
      }
    });
    this.items = [...items.values()];
    this.magic = [...magic.values()];
  }

  get primary() { return this.files[0]; }
  get name() { return this.primary.name; }
  get currency() { return this.primary.data.currency; }

  // Case-insensitive, by name or id, so "longsword" in a class kit finds "Longsword".
  findItem(name: string, kinds?: ItemKind[]): WithRef<EquipmentItem> | undefined {
    const n = name.trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
    return this.items.find((i) => (!kinds || kinds.includes(i.kind)) && (i.name.toLowerCase() === n || i.id === n));
  }

  armorOfType(type: ArmorType): WithRef<EquipmentItem> | undefined {
    return this.items.find((i) => i.kind === 'armor' && !i.barding && i.armorType === type);
  }

  magicOf(system: MagicSystem | undefined): WithRef<MagicEntry>[] {
    return system ? this.magic.filter((m) => m.system === system) : [];
  }

  findMagic(name: string, system: MagicSystem | undefined): WithRef<MagicEntry> | undefined {
    const n = name.trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
    return this.magicOf(system).find((m) => m.name.toLowerCase() === n || m.id === n);
  }

  private _gear?: GearCatalog;
  catalog(): GearCatalog {
    return (this._gear ??= { ...gearCatalog(this.items), page: this.primary.catalog().page });
  }
}

// The built-in files.
export const EQUIPMENT: EquipmentFile[] = [
  new EquipmentFile(mmEquipment as EquipmentFileData),
  new EquipmentFile(e9Equipment as EquipmentFileData)
];

// Every file this device knows: the built-in ones, its own custom file ("local"), and
// files from campaigns. References resolve against all of them, whatever campaign is
// active, so a character from another campaign keeps its numbers.
const registry = new Map<string, EquipmentFile>(EQUIPMENT.map((f) => [f.id, f]));
const BUILT_IN = new Set(EQUIPMENT.map((f) => f.id));
export const LOCAL_ID = 'local';
let version = 0;
// The active campaign's files; null uses each ruleset's own.
let campaignFiles: string[] | null = null;

export function isBuiltIn(id: string): boolean {
  return BUILT_IN.has(id);
}

export function hasEquipment(id: string): boolean {
  return registry.has(id);
}

export function registerEquipment(data: EquipmentFileData): EquipmentFile {
  checkEquipment(data);
  if (BUILT_IN.has(data.id)) throw new EquipmentError(`"${data.id}" is a built-in equipment file; give this one its own id`);
  const f = new EquipmentFile(data);
  registry.set(data.id, f);
  version++;
  return f;
}

export function unregisterEquipment(id: string) {
  if (BUILT_IN.has(id) || !registry.delete(id)) return;
  version++;
}

export function useCampaignEquipment(ids: string[] | null) {
  campaignFiles = ids;
  version++;
}

export function equipmentFile(id: string): EquipmentFile {
  const f = registry.get(id);
  if (!f) throw new Error(`Unknown equipment file "${id}"`);
  return f;
}

// Changes whenever a file or the active campaign changes, so views can redraw.
export function equipmentVersion(): number {
  return version;
}

const catalogs = new Map<string, Catalog>();

// A ruleset's files (or the campaign's instead), then this device's custom file.
export function catalogFor(defaults: string[]): Catalog {
  const ids = [...(campaignFiles ?? defaults), LOCAL_ID].filter((id, i, all) => registry.has(id) && all.indexOf(id) === i);
  const key = `${version}:${ids.join(',')}`;
  let c = catalogs.get(key);
  if (!c) {
    if (catalogs.size > 20) catalogs.clear();
    c = new Catalog(ids.map((id) => registry.get(id)!));
    catalogs.set(key, c);
  }
  return c;
}

// "mm:longsword" -> the Longsword entry in mm-equipment.json.
export function resolve(ref: string): EquipmentItem | MagicEntry | undefined {
  const i = ref.indexOf(':');
  if (i < 0) return undefined;
  return registry.get(ref.slice(0, i))?.get(ref.slice(i + 1));
}

export class EquipmentError extends Error {}

const ITEM_KINDS = ['armor', 'weapon', 'gear', 'mount', 'service'];
const SYSTEMS = ['arcane', 'divine', 'primal', 'dweomer'];
const EFFECT_KINDS = ['bonus', 'set', 'damage', 'convert', 'resist', 'easier', 'harder', 'text'];

// Checks a file from a campaign URL, an import, or the custom editor, and says what's
// wrong in words a referee can act on.
export function checkEquipment(d: unknown): asserts d is EquipmentFileData {
  const f = d as Partial<EquipmentFileData> | null;
  const fail = (why: string) => {
    throw new EquipmentError(`${f?.name ? `${f.name}: ` : ''}${why}`);
  };
  if (!f || typeof f !== 'object' || f.format !== 'materia-mundi-equipment') fail('not a Materia Mundi equipment file');
  if (typeof f!.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f!.id)) fail('needs an "id" in lower-case letters, digits and dashes');
  if (!Array.isArray(f!.items) || !Array.isArray(f!.magic)) fail('needs "items" and "magic" lists');
  const ids = new Set<string>();
  for (const e of [...f!.items!, ...f!.magic!] as { id?: unknown; name?: unknown }[]) {
    if (typeof e?.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) fail(`entry ${JSON.stringify(e?.name ?? e?.id)} needs an id in lower-case letters, digits and dashes`);
    if (ids.has(e.id as string)) fail(`two entries use the id "${e.id}"`);
    ids.add(e.id as string);
    if (typeof e.name !== 'string' || !e.name.trim()) fail(`"${e.id}" needs a name`);
  }
  for (const i of f!.items!) if (!ITEM_KINDS.includes(i.kind)) fail(`"${i.id}" has an unknown kind "${i.kind}"`);
  for (const m of f!.magic!) {
    if (!SYSTEMS.includes(m.system)) fail(`"${m.id}" has an unknown system "${m.system}"`);
    if (m.effects !== undefined && (!Array.isArray(m.effects) || m.effects.some((e) => !e || typeof e !== 'object' || !EFFECT_KINDS.some((k) => k in e))))
      fail(`"${m.id}" has an effect the app can't read; each needs one of ${EFFECT_KINDS.join(', ')}`);
  }
  f!.rules ??= [];
}

export function resolveMagic(ref: string | undefined): MagicEntry | undefined {
  const e = ref ? resolve(ref) : undefined;
  return e && 'system' in e ? e : undefined;
}

// Only physical items: armor, weapons, gear, mounts, services.
export function resolveItem(ref: string | undefined): EquipmentItem | undefined {
  const e = ref ? resolve(ref) : undefined;
  return e && 'kind' in e ? e : undefined;
}
