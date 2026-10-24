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
  twoHanded: boolean;
  // Masterwork or magic: added to melee damage, or to ranged attack throws.
  bonus: number;
  enchantment: string;
  properties: string[];
}

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
    twoHanded: kind?.twoHanded ?? false,
    bonus: 0,
    enchantment: '',
    properties: [...(kind?.properties ?? [])]
  };
}

export function defense(rules: Ruleset, armor: ArmorItem | undefined): number {
  return armor ? rules.armorKind(armor.type).defense + armor.bonus : 0;
}

// Heavy weapons always take both hands; so do the shortbow in Materia Mundi and every
// medium ranged weapon in E9.
export function needsBothHands(rules: Ruleset, w: WeaponItem | undefined): boolean {
  if (!w) return false;
  return w.size === 'heavy' || w.twoHanded || (w.ranged && w.size === 'medium' && !!rules.mechanics.mediumRangedTwoHanded);
}

// What may go in the off hand alongside the main-hand weapon: a shield or a light
// melee weapon, and only when the main hand isn't using both hands.
export function fitsOffHand(rules: Ruleset, main: WeaponItem | undefined, w: WeaponItem): boolean {
  if (needsBothHands(rules, main) || needsBothHands(rules, w) || w.id === main?.id) return false;
  return w.shield || (w.size === 'light' && !w.ranged);
}

export function fitsMainHand(w: WeaponItem): boolean {
  return !w.shield;
}

const plus = (n: number) => (n > 0 ? `+${n}` : n < 0 ? String(n) : '');

// Damage dice for the weapon in the main hand (Compendium p. 49, E9 p. 35). A light
// weapon in the off hand adds its d6. A medium melee weapon held in both hands
// (nothing in the off hand) offers 2d6 instead of d6+Str.
export function damageOptions(main: WeaponItem | undefined, off: WeaponItem | undefined, str: number): { label: string; expression: string }[] {
  const offDie = off && !off.shield ? '+d6' : '';
  if (!main) return [{ label: 'Unarmed', expression: `d6${offDie}` }];
  const bonus = main.ranged ? '' : plus(main.bonus);
  if (main.ranged) return [{ label: '', expression: (main.size === 'heavy' ? '2d6' : 'd6') + offDie }];
  if (main.size === 'light') return [{ label: '', expression: `d6${bonus}${offDie}` }];
  if (main.size === 'heavy') return [{ label: '', expression: `2d6${plus(str + main.bonus)}` }];
  const oneHand = { label: off ? '' : '1h', expression: `d6${plus(str + main.bonus)}${offDie}` };
  return off ? [oneHand] : [oneHand, { label: '2h', expression: `2d6${bonus}` }];
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
// hand with a shield or a second light weapon when there's one to spare.
export function defaultLoadout(rules: Ruleset, armor: ArmorItem[], weapons: WeaponItem[]): { worn: string; wielded: Hands } {
  const main = weapons.find((w) => fitsMainHand(w) && !w.ranged) ?? weapons.find((w) => fitsMainHand(w));
  const off =
    weapons.find((w) => w.shield && fitsOffHand(rules, main, w)) ??
    weapons.find((w) => !w.shield && fitsOffHand(rules, main, w));
  return { worn: armor[0]?.id ?? '', wielded: [main?.id ?? '', off?.id ?? ''] };
}
