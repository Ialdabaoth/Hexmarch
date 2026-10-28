// Armor and weapons are inventory items. Each carries what a player would write on the
// sheet (type, size, encumbrance, reach or range, bonus); what they do in play (defense,
// damage, which hands they take) is worked out here from the ruleset's equipment chapter.
// An item from an equipment file has a `ref` ("mm:longsword"); in memory it carries the
// file's numbers too, but a saved sheet keeps only the ref and what's unique to it.

import type { ArmorType, Ruleset, WeaponSize } from '../rules/rules';
import { resolveItem, type EquipmentItem } from '../equipment/equipment';

export interface ArmorItem {
  id: string;
  // Where its numbers come from; left out for custom armor.
  ref?: string;
  name: string;
  type: ArmorType;
  encumbrance: number;
  // Masterwork or magic: added to the armor's defense.
  bonus: number;
  // Reserved for magic armor; free text for now.
  enchantment: string;
}

export interface WeaponItem {
  id: string;
  // Where its numbers come from; left out for a custom weapon.
  ref?: string;
  name: string;
  // The kind from the equipment list ("Longsword", "Shield"); custom names are fine.
  type: string;
  size: WeaponSize;
  encumbrance: number;
  // Extra melee reach in paces (0 for none).
  reach: number;
  // Short range in paces for a ranged or thrown weapon (0 for none).
  range: number;
  ranged: boolean;
  shield: boolean;
  // Masterwork or magic: added to melee damage, or to ranged attack throws.
  bonus: number;
  enchantment: string;
  properties: string[];
}

// Everything else carried: gear from the equipment file, or anything written in.
export interface CarriedItem {
  id: string;
  ref?: string;
  name: string;
  qty: number;
}

// Ids of the weapons in the main and off hands ("" for empty). A medium weapon held in
// both hands has its id in both.
export type Hands = [main: string, off: string];

export function itemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function armorStats(e: EquipmentItem): Pick<ArmorItem, 'type' | 'encumbrance'> {
  return { type: e.armorType ?? 'light', encumbrance: e.encumbrance ?? 0 };
}

export function weaponStats(e: EquipmentItem): Omit<WeaponItem, 'id' | 'ref' | 'name' | 'bonus' | 'enchantment'> {
  return {
    type: e.name,
    size: e.size ?? 'medium',
    encumbrance: e.encumbrance ?? 0,
    reach: e.reach ?? 0,
    range: e.range ?? e.thrown ?? 0,
    ranged: e.ranged ?? false,
    shield: e.shield ?? false,
    properties: [...(e.properties ?? [])]
  };
}

export function newArmor(rules: Ruleset, type: ArmorType, name?: string): ArmorItem {
  const kind = rules.armorKind(type);
  const entry = rules.equipment.armorOfType(kind.type);
  return {
    id: itemId(),
    ...(entry ? { ref: entry.ref } : {}),
    name: name ?? `${type[0].toUpperCase()}${type.slice(1)} armor`,
    type: kind.type,
    encumbrance: kind.encumbrance,
    bonus: 0,
    enchantment: ''
  };
}

export function newWeapon(rules: Ruleset, type: string, name?: string): WeaponItem {
  const entry = rules.equipment.findItem(type, ['weapon']);
  if (entry) return { id: itemId(), ref: entry.ref, name: name ?? entry.name, ...weaponStats(entry), bonus: 0, enchantment: '' };
  return {
    id: itemId(),
    name: name ?? type,
    type,
    size: 'medium',
    encumbrance: 0,
    reach: 0,
    range: 0,
    ranged: false,
    shield: false,
    bonus: 0,
    enchantment: '',
    properties: []
  };
}

export function newItem(rules: Ruleset, name: string, qty = 1): CarriedItem {
  const entry = rules.equipment.findItem(name, ['gear', 'mount', 'service']);
  const written = name.trim();
  return {
    id: itemId(),
    ...(entry ? { ref: entry.ref } : {}),
    name: entry?.name ?? written[0].toUpperCase() + written.slice(1),
    qty
  };
}

// A referenced weapon that no longer matches its file (edited by hand, or an old sheet
// with its own numbers) becomes custom, so nothing the player wrote is lost.
export function matchesRef(w: WeaponItem): boolean {
  const e = resolveItem(w.ref);
  if (e?.kind !== 'weapon') return false;
  const s = weaponStats(e);
  return (Object.keys(s) as (keyof typeof s)[]).every((k) => JSON.stringify(s[k]) === JSON.stringify(w[k]));
}

// What a saved sheet keeps of each item: with a reference that resolves, only the ref
// and what's unique to this one; otherwise everything.
export function compactArmor(a: ArmorItem): object {
  if (resolveItem(a.ref)?.kind !== 'armor') return a;
  return { id: a.id, ref: a.ref, name: a.name, ...(a.bonus ? { bonus: a.bonus } : {}), ...(a.enchantment ? { enchantment: a.enchantment } : {}) };
}

export function compactWeapon(w: WeaponItem): object {
  if (resolveItem(w.ref)?.kind !== 'weapon') return w;
  return { id: w.id, ref: w.ref, name: w.name, ...(w.bonus ? { bonus: w.bonus } : {}), ...(w.enchantment ? { enchantment: w.enchantment } : {}) };
}

export function compactItem(i: CarriedItem): object {
  return { id: i.id, ...(i.ref ? { ref: i.ref } : {}), name: i.name, ...(i.qty !== 1 ? { qty: i.qty } : {}) };
}

export function itemLabel(i: CarriedItem): string {
  return i.qty > 1 ? `${i.name} ×${i.qty}` : i.name;
}

export function defense(rules: Ruleset, armor: ArmorItem | undefined): number {
  return armor ? rules.armorKind(armor.type).defense + armor.bonus : 0;
}

// Light weapons and shields take one hand and heavy weapons both; a medium weapon
// takes one or two, chosen when it's wielded.
export function grips(w: WeaponItem): ('one' | 'two')[] {
  if (w.shield || w.size === 'light') return ['one'];
  if (w.size === 'heavy') return ['two'];
  return ['one', 'two'];
}

export function usesBothHands(main: WeaponItem | undefined, hands: Hands): boolean {
  return !!main && (main.size === 'heavy' || (hands[1] === main.id && !main.shield));
}

// What may go in the off hand: a shield or a light melee weapon, when the main hand
// leaves it free.
export function fitsOffHand(main: WeaponItem | undefined, hands: Hands, w: WeaponItem): boolean {
  if (usesBothHands(main, hands) || w.id === main?.id) return false;
  return w.shield || (w.size === 'light' && !w.ranged);
}

export function fitsMainHand(w: WeaponItem): boolean {
  return !w.shield;
}

const plus = (n: number) => (n > 0 ? `+${n}` : n < 0 ? String(n) : '');

// Damage dice for the weapon in the main hand (Compendium p. 49, E9 p. 35). A medium
// melee weapon deals d6+Str in one hand or 2d6 in two; a light weapon in the off hand
// adds its d6.
export function damage(main: WeaponItem | undefined, off: WeaponItem | undefined, bothHands: boolean, str: number): string {
  const offDie = off && !off.shield && off.id !== main?.id ? '+d6' : '';
  if (!main) return `d6${offDie}`;
  if (main.ranged) return (main.size === 'heavy' ? '2d6' : 'd6') + offDie;
  if (main.size === 'light') return `d6${plus(main.bonus)}${offDie}`;
  if (main.size === 'heavy') return `2d6${plus(str + main.bonus)}`;
  return bothHands ? `2d6${plus(main.bonus)}` : `d6${plus(str + main.bonus)}${offDie}`;
}

// Everything worn or carried at the ready (Compendium p. 51): armor counts whether
// worn or packed, and so do heavy weapons, shields and polearms.
export function gearLoad(armor: ArmorItem[], weapons: WeaponItem[]): number {
  return [...armor, ...weapons].reduce((sum, g) => sum + g.encumbrance, 0);
}

// Turns a class's starting kit ("Longsword, heavy armor, shield, two daggers") into
// items. Anything that isn't armor or a weapon is carried gear, from the equipment file
// when it's there.
export function parseKit(rules: Ruleset, kit: string) {
  const armor: ArmorItem[] = [];
  const weapons: WeaponItem[] = [];
  const items: CarriedItem[] = [];
  const counts: Record<string, number> = { two: 2, three: 3, four: 4 };
  for (const raw of kit.split(/,\s*/).map((g) => g.trim()).filter(Boolean)) {
    const m = raw.match(/^(two|three|four)\s+(.+?)s$/i);
    const count = m ? counts[m[1].toLowerCase()] : 1;
    const name = m ? m[2] : raw;
    const armorType = name.match(/^(light|medium|heavy) armou?r$/i)?.[1].toLowerCase() as ArmorType | undefined;
    if (armorType) {
      armor.push(newArmor(rules, armorType));
    } else if (rules.weaponKind(name)) {
      for (let i = 0; i < count; i++) weapons.push(newWeapon(rules, name));
    } else {
      items.push(newItem(rules, raw));
    }
  }
  return { armor, weapons, items };
}

// Starting choices: wear the first armor, wield the first melee weapon, and fill the off
// hand with a shield or a second light weapon when there's one to spare. A medium
// weapon with nothing for the off hand is held two-handed.
export function defaultLoadout(armor: ArmorItem[], weapons: WeaponItem[]): { worn: string; wielded: Hands } {
  const main = weapons.find((w) => fitsMainHand(w) && !w.ranged) ?? weapons.find((w) => fitsMainHand(w));
  const hands: Hands = [main?.id ?? '', ''];
  const off =
    weapons.find((w) => w.shield && fitsOffHand(main, hands, w)) ??
    weapons.find((w) => !w.shield && fitsOffHand(main, hands, w));
  return { worn: armor[0]?.id ?? '', wielded: [hands[0], off?.id ?? (main?.size === 'medium' ? main.id : '')] };
}
