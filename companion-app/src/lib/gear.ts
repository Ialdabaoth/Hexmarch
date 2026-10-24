// Armor and weapons are inventory items. Each carries what a player would write on the
// sheet (type, size, encumbrance, reach or range, bonus); what they do in play (defense,
// damage, which hands they take) is worked out here from the ruleset's equipment chapter.

import type { ArmorType, Ruleset, WeaponSize } from '../rules/rules';

export interface ArmorItem {
  id: string;
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

// Ids of the weapons in the main and off hands ("" for empty). A medium weapon held in
// both hands has its id in both.
export type Hands = [main: string, off: string];

export function itemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newArmor(rules: Ruleset, type: ArmorType, name?: string): ArmorItem {
  const kind = rules.armorKind(type);
  return { id: itemId(), name: name ?? `${type[0].toUpperCase()}${type.slice(1)} armor`, type: kind.type, encumbrance: kind.encumbrance, bonus: 0, enchantment: '' };
}

export function newWeapon(rules: Ruleset, type: string, name?: string): WeaponItem {
  const kind = rules.weaponKind(type);
  return {
    id: itemId(),
    name: name ?? kind?.type ?? type,
    type: kind?.type ?? type,
    size: kind?.size ?? 'medium',
    encumbrance: kind?.encumbrance ?? 0,
    reach: kind?.reach ?? 0,
    range: kind?.range ?? kind?.thrown ?? 0,
    ranged: kind?.ranged ?? false,
    shield: kind?.shield ?? false,
    bonus: 0,
    enchantment: '',
    properties: [...(kind?.properties ?? [])]
  };
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
// items. Anything that isn't armor or a known weapon stays a plain item.
export function parseKit(rules: Ruleset, kit: string) {
  const armor: ArmorItem[] = [];
  const weapons: WeaponItem[] = [];
  const items: string[] = [];
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
      items.push(raw[0].toUpperCase() + raw.slice(1));
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
