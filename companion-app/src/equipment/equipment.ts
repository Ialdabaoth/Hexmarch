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

// Spells, miracles, glamours and dweomers. Filled in by a later version.
export interface MagicEntry {
  id: string;
  name: string;
  system: 'arcane' | 'divine' | 'primal' | 'dweomer';
  page?: number;
  summary?: string;
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
