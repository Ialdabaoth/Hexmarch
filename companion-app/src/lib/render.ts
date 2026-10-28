// Everything a rendered sheet shows. Printouts are records, so they use the sheet's
// permanent values and leave current HP blank; the home screen passes the live state.

import { Character, attackThresholds, carrying, equipment, freshState, type LiveState, hasExpertise, hitDieLabel, saveThreshold, xpToNext } from './character';
import type { SheetData } from './sheet';
import { ABILITIES, TALENTS, type Difficulty } from '../rules/rules';
import { armorEffect, checkPreparations, emptySlots } from './magic';

export function sheetView(data: SheetData, live?: LiveState) {
  const c = new Character(data, live ?? freshState());
  const cls = c.rules.getClass(c.classId);
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const gear = equipment(c);
  const armor = armorEffect(cls.magic?.armor, gear.worn?.type, !!(gear.main?.shield || gear.off?.shield));
  return {
    c,
    live: !!live,
    cls,
    title: `Level ${c.level} ${c.rules.getOrigin(c.origin).name} ${cls.name}`,
    xp: `${c.xp} / ${xpToNext(c)}`,
    hitDie: hitDieLabel(c),
    attacks: attackThresholds(c),
    carry: carrying(c),
    gear,
    magic: c.magic.lines(),
    // What stops prepared magic being cast, e.g. "heavy armor" for a wizard.
    magicBlockedBy: armor.blockedBy,
    // The circle of each slot this level hasn't filled yet (spent preparations still fill theirs).
    emptySlots: cls.magic ? emptySlots(checkPreparations(cls.magic.slots, c.level, data.inventory.prepared, armor.penalty)) : [],
    abilities: ABILITIES.map((a) => ({ ...a, score: signed(c.abilities[a.id]), threshold: saveThreshold(c, a.id) })),
    talents: TALENTS.map((t) => ({ ...t, threshold: c.talents[t.id], expert: hasExpertise(c, t.id) })),
    features: cls.features.filter((f) => f.level <= c.level),
    levels: c.sheet.levels(),
    signed,
    // Rarities print as C/U/R/L to keep the line short.
    circle: (n: number) => (cls.magic?.circleWord === 'Rarity' ? 'CURL'[n - 1] ?? `R${n}` : `${n}${['st', 'nd', 'rd'][n - 1] ?? 'th'}`)
  };
}

// What tapping a value on a rendered card asks to roll.
export type RollRequest =
  | { kind: 'check'; label: string; sides: 6 | 20; threshold: number; attack?: boolean; difficulty?: Difficulty }
  | { kind: 'expr'; label: string; expression: string; min?: number };

export type SheetView = ReturnType<typeof sheetView>;
