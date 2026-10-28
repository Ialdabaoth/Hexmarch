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
}

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
    const armor = this.items.filter((i) => i.kind === 'armor' && !i.barding);
    const weapons = this.items.filter((i) => i.kind === 'weapon');
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
}

export type WithRef<T> = T & { ref: string };

// The equipment files a ruleset or campaign uses, in priority order. Armor and weapons
// come from the first file, so a ruleset's own arms list stays as the book has it;
// other gear and magic come from all of them, the first file winning on a name.
export class Catalog {
  readonly items: WithRef<EquipmentItem>[];
  readonly magic: WithRef<MagicEntry>[];

  constructor(readonly files: EquipmentFile[]) {
    const items = new Map<string, WithRef<EquipmentItem>>();
    const magic = new Map<string, WithRef<MagicEntry>>();
    files.forEach((f, i) => {
      for (const it of f.items) {
        if (i > 0 && (it.kind === 'armor' || it.kind === 'weapon')) continue;
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

  catalog(): GearCatalog {
    return this.primary.catalog();
  }
}

export const EQUIPMENT: EquipmentFile[] = [
  new EquipmentFile(mmEquipment as EquipmentFileData),
  new EquipmentFile(e9Equipment as EquipmentFileData)
];

export function equipmentFile(id: string): EquipmentFile {
  const f = EQUIPMENT.find((e) => e.id === id);
  if (!f) throw new Error(`Unknown equipment file "${id}"`);
  return f;
}

// "mm:longsword" -> the Longsword entry in mm-equipment.json.
export function resolve(ref: string): EquipmentItem | MagicEntry | undefined {
  const i = ref.indexOf(':');
  if (i < 0) return undefined;
  return EQUIPMENT.find((e) => e.id === ref.slice(0, i))?.get(ref.slice(i + 1));
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
