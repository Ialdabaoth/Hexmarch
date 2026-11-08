// What magic items do while they're worn, wielded or carried: the effects listed on each
// dweomer in the equipment file, worked out for this character. Computed live from the
// inventory, never saved. Of several bonuses to the same thing only the highest counts
// (Compendium p. 55); an effect with a "vs." condition is shown, not added.

import { ABILITIES, TALENTS, type ArmorType } from '../rules/rules';
import {
  DAMAGE_TYPES, RARITIES, resolveMagic,
  type Amount, type DamageKind, type DamageType, type EffectTarget, type MagicEffect, type MagicEntry
} from '../equipment/equipment';
import type { Enchantment, WeaponItem } from './gear';
import type { SheetData } from './sheet';

export type Slot = 'armor' | 'main' | 'off' | 'carried';

// One effect from one item, with the item's rarity worked in.
export interface ActiveEffect {
  effect: MagicEffect;
  source: string;
  slot: Slot;
  // Rarity bonus: common 0 to legendary 3 (p. 55).
  rarity: number;
  // Elemental items: the element chosen when the item was made.
  element?: DamageType;
}

export interface Situation {
  armor: 'none' | ArmorType;
  attack?: 'melee' | 'ranged';
}

export interface Bonus {
  amount: number;
  source: string;
}

// Potions and elixirs act when drunk, not while carried.
const CONSUMED: MagicEntry['form'][] = ['potion'];

export function enchantmentRarity(e: Enchantment, entry: MagicEntry): number {
  const r = e.rarity ?? entry.rarity ?? entry.rarities?.[0] ?? 'common';
  return RARITIES.indexOf(r);
}

export function amountOf(a: Amount, rarity: number, times = 1): number {
  return (a === 'rarity' ? rarity : a === 'level' ? rarity + 1 : a) * times;
}

export function hasDweomer(item: { enchantment?: Enchantment } | undefined): boolean {
  return !!resolveMagic(item?.enchantment?.ref);
}

function effectsOf(item: { name: string; enchantment?: Enchantment }, slot: Slot): ActiveEffect[] {
  const e = item.enchantment;
  const entry = resolveMagic(e?.ref);
  if (!e || !entry?.effects || (slot === 'carried' && CONSUMED.includes(entry.form))) return [];
  const rarity = enchantmentRarity(e, entry);
  return entry.effects.map((effect) => ({ effect, source: item.name, slot, rarity, ...(e.element ? { element: e.element } : {}) }));
}

// Everything in effect: worn armor, what's in hand, and the rest of the pack.
export function activeEffects(inv: SheetData['inventory']): ActiveEffect[] {
  const worn = inv.armor.find((a) => a.id === inv.worn);
  const main = inv.weapons.find((w) => w.id === inv.wielded[0]);
  const off = inv.weapons.find((w) => w.id === inv.wielded[1] && w.id !== main?.id);
  return [
    ...(worn ? effectsOf(worn, 'armor') : []),
    ...(main ? effectsOf(main, 'main') : []),
    ...(off ? effectsOf(off, 'off') : []),
    ...inv.items.flatMap((i) => effectsOf(i, 'carried'))
  ];
}

// A save is named by its ability ("save:con") or by its name ("save:doom").
function matches(target: EffectTarget, want: string): boolean {
  if (target === want) return true;
  const [kind, which] = want.split(':');
  if (target === kind && kind === 'save') return true;
  if (kind === 'save' && target.startsWith('save:')) {
    const a = ABILITIES.find((x) => x.id === which);
    return target === `save:${a?.save.toLowerCase()}`;
  }
  return false;
}

// Only the main hand's weapon adds to damage; a weapon's bonuses are for its own kind
// of attack.
function applies(a: ActiveEffect, s: Situation, main?: WeaponItem): boolean {
  const when = a.effect.when;
  if (when?.armor && !when.armor.includes(s.armor)) return false;
  const attack = when?.attack ?? (a.slot === 'main' && main ? (main.ranged ? 'ranged' : 'melee') : undefined);
  if (attack && s.attack && attack !== s.attack) return false;
  if (attack && !s.attack && 'bonus' in a.effect && ['damage', 'range'].includes(a.effect.bonus)) return false;
  return true;
}

export class Magic {
  constructor(
    readonly active: ActiveEffect[],
    readonly situation: Situation,
    readonly main?: WeaponItem
  ) {}

  static of(inv: SheetData['inventory']) {
    const worn = inv.armor.find((a) => a.id === inv.worn);
    const main = inv.weapons.find((w) => w.id === inv.wielded[0]);
    return new Magic(activeEffects(inv), { armor: worn?.type ?? 'none' }, main);
  }

  // The highest bonus and the worst penalty to one thing, from effects without a condition.
  bonus(want: string, attack?: 'melee' | 'ranged'): Bonus | undefined {
    const s = { ...this.situation, attack };
    let best: Bonus | undefined;
    let worst: Bonus | undefined;
    for (const a of this.active) {
      const e = a.effect;
      if (!('bonus' in e) || e.vs || !matches(e.bonus, want) || !applies(a, s, this.main)) continue;
      if (a.slot === 'off' && /^(damage|range)/.test(want)) continue;
      const amount = amountOf(e.amount, a.rarity, e.times);
      if (amount > (best?.amount ?? 0)) best = { amount, source: a.source };
      if (amount < (worst?.amount ?? 0)) worst = { amount, source: a.source };
    }
    if (best && worst) return { amount: best.amount + worst.amount, source: `${best.source}, ${worst.source}` };
    return best ?? worst;
  }

  amount(want: string, attack?: 'melee' | 'ranged'): number {
    return this.bonus(want, attack)?.amount ?? 0;
  }

  // "Your defense is…" effects, such as Mage Robes.
  setDefense(): Bonus | undefined {
    let best: Bonus | undefined;
    for (const a of this.active) {
      const e = a.effect;
      if (!('set' in e) || e.vs || !applies(a, this.situation, this.main)) continue;
      const amount = amountOf(e.amount, a.rarity, e.times);
      if (amount > (best?.amount ?? -1)) best = { amount, source: a.source };
    }
    return best;
  }

  // Extra damage dice from the weapon in hand ("+2d6 fire").
  extraDamage(attack: 'melee' | 'ranged'): { dice: string; types: DamageType[]; source: string }[] {
    const s = { ...this.situation, attack };
    return this.active
      .filter((a) => 'damage' in a.effect && !a.effect.vs && fromWeapon(a) && applies(a, s, this.main))
      .map((a) => {
        const e = a.effect as Extract<MagicEffect, { damage: string }>;
        return { dice: scaleDice(e.damage, times(e.per, a.rarity, this.main)), types: kinds(e.type, a.element, this.main), source: a.source };
      });
  }

  // The main weapon's damage type: its own, or what its dweomer turns it into.
  damageTypes(): DamageType[] | undefined {
    const c = this.active.find((a) => 'convert' in a.effect && a.slot === 'main');
    return c ? kinds((c.effect as { convert: DamageKind | DamageKind[] }).convert, c.element) : undefined;
  }

  resists() {
    return this.active.filter((a) => 'resist' in a.effect);
  }

  // Effects that make rolls Easy or Hard.
  easier() {
    return this.active.filter((a) => 'easier' in a.effect || 'harder' in a.effect);
  }

  lines(): { source: string; text: string }[] {
    return this.active.map((a) => ({ source: a.source, text: describeEffect(a.effect, a.rarity, a.element, fromWeapon(a) ? this.main : undefined) }));
  }
}

// Damage comes from the weapon in hand, or from carried ammunition (a quiver) for the
// kind of attack it names.
function fromWeapon(a: ActiveEffect): boolean {
  return a.slot === 'main' || (a.slot === 'carried' && !!a.effect.when?.attack);
}

export function sizeSteps(w: WeaponItem | undefined): number {
  return w?.size === 'heavy' ? 3 : w?.size === 'medium' ? 2 : 1;
}

function times(per: 'rarity' | 'level' | 'size' | undefined, rarity: number, w?: WeaponItem): number {
  return per === 'size' ? sizeSteps(w) : per ? rarity + 1 : 1;
}

// "1d6" per rarity level at rare (level 3) is "3d6".
export function scaleDice(dice: string, n: number): string {
  const m = dice.match(/^(\d*)d(\d+)$/);
  return m ? `${(Number(m[1] || 1)) * n}d${m[2]}` : dice;
}

// "physical:piercing" counts as physical; "elemental" is the item's chosen element.
// "physical" alone is the weapon's own kind (a keen blade).
function kinds(k: DamageKind | DamageKind[], element?: DamageType, w?: WeaponItem): DamageType[] {
  return (Array.isArray(k) ? k : [k]).map((x) =>
    x === 'elemental' ? element ?? 'elemental' : x === 'physical' && w ? `physical:${physicalType(w)}` : x
  ) as DamageType[];
}

// What a weapon deals before magic: blunt, piercing (and arrows and bolts) or slashing.
export function physicalType(w: WeaponItem | undefined): string {
  if (!w) return 'blunt';
  const p = w.properties;
  if (p.includes('Blunt')) return 'blunt';
  if (p.includes('Piercing') || (w.ranged && !p.some((x) => x.startsWith('Thrown')))) return 'piercing';
  return 'slashing';
}

export function damageTypeName(k: string): string {
  return k.startsWith('physical:') ? k.slice('physical:'.length) : k;
}

export const ELEMENTS: DamageType[] = DAMAGE_TYPES.filter((t) => !['physical', 'metal', 'petrification'].includes(t));

export function targetName(t: EffectTarget): string {
  if (t === 'defense' || t === 'damage') return t;
  if (t === 'hp') return 'HP';
  if (t === 'range') return 'range (paces)';
  if (t === 'save') return 'saves';
  const [kind, which] = t.split(':');
  if (kind === 'ability') return ABILITIES.find((a) => a.id === which)?.short ?? which;
  if (kind === 'talent') return TALENTS.find((x) => x.id === which)?.name ?? which;
  if (kind === 'save') return `saves vs. ${which[0].toUpperCase()}${which.slice(1)}`;
  return t;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const list = (k: DamageKind | DamageKind[], element?: DamageType, w?: WeaponItem) => kinds(k, element, w).map(damageTypeName).join(' or ');

// One effect in words, at the item's rarity: "+2 Str", "+3d6 fire damage (melee)".
export function describeEffect(e: MagicEffect, rarity: number, element?: DamageType, weapon?: WeaponItem): string {
  const amt = (a: Amount) => amountOf(a, rarity, e.times);
  let text: string;
  if ('bonus' in e) text = `${signed(amt(e.amount))} ${targetName(e.bonus)}`;
  else if ('set' in e) text = `Defense ${amt(e.amount)}`;
  else if ('damage' in e && e.damage === 'equal') text = `An equal amount of ${list(e.type, element)} damage`;
  else if ('damage' in e && e.per === 'size' && !weapon)
    text = `+${scaleDice(e.damage, 1)}/${scaleDice(e.damage, 2)}/${scaleDice(e.damage, 3)} ${list(e.type, element)} damage (light/medium/heavy weapon)`;
  else if ('damage' in e) text = `+${scaleDice(e.damage, times(e.per, rarity, weapon))} ${list(e.type, element, weapon)} damage`;
  else if ('convert' in e) text = `Deals ${list(e.convert, element)} damage`;
  else if ('resist' in e) {
    const what = e.resist === 'all' ? 'all damage' : `${list(e.resist, element)} damage`;
    text = {
      half: `Half ${what}`,
      immune: `Immune to ${what}`,
      vulnerable: `Double ${what}`,
      reduce: `${what[0].toUpperCase()}${what.slice(1)} reduced by ${e.amount === undefined ? 0 : amt(e.amount)}`,
      armor: `Armor protects against ${what}`
    }[e.mode];
  } else if ('easier' in e) text = `Easy ${targetName(e.easier)}`;
  else if ('harder' in e) text = `Hard ${targetName(e.harder)}`;
  else text = e.text;
  const when = [
    e.when?.attack,
    e.when?.armor ? (e.when.armor.includes('none') ? `in ${e.when.armor.filter((x) => x !== 'none').join(' or ')} armor or none` : `in ${e.when.armor.join(' or ')} armor`) : ''
  ].filter(Boolean);
  if (when.length) text += ` (${when.join(', ')})`;
  if (e.vs) text += `, ${e.vs.startsWith('vs.') || e.vs.startsWith('to ') || e.vs.startsWith('when') ? '' : 'vs. '}${e.vs}`;
  if (e.lasts) text += `, for ${e.lasts}`;
  return text;
}
