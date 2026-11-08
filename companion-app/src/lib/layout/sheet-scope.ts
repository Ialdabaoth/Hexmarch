// The named values a layout can show for a character (SHEET_LAYOUT.md section 4): the sheet's four parts
// (stats, gear, knowledge, flavor, as in CHARACTER_FORMAT.md version 4) and the root's derived values
// under d.*. E9 and Materia Mundi keep their own rules engine (rules.ts), so d.* is that engine's
// results as plain data; a root with only derive.json fills d.* from its tables instead.
import { WORN_SLOTS, damage as dice, grips, itemLabel, type WeaponItem } from '../gear';
import { byCircle } from '../magic';
import type { SheetView } from '../render';
import { writeParts } from '../sheet';
import type { Scope } from './values';

export interface FrameFlags {
  // Current HP and the like (the home screen); printouts leave them blank.
  live: boolean;
  // The card's own editors are wired (the home screen); elsewhere the card is a printout.
  edit: boolean;
}

export function sheetScope(v: SheetView, frame: FrameFlags): Scope {
  const data = v.c.data;
  const inv = data.inventory;
  const g = v.gear;
  const parts = JSON.parse(JSON.stringify(writeParts(data))) as Record<string, unknown>;
  const circleTag = (n: number) => (v.cls.magic?.circleWord === 'Rarity' ? v.circle(n) : String(n));

  // Preparations and empty slots together, by circle; filled slots come before empty ones of the same circle.
  const prepLines = [
    ...byCircle(inv.prepared).map(({ entry, i }) => ({ filled: true, i, circle: entry.circle, magic: entry.magic, spent: entry.spent })),
    ...v.emptySlots.map((circle) => ({ filled: false, i: -1, circle, magic: '', spent: false }))
  ].sort((a, b) => a.circle - b.circle || Number(!a.filled) - Number(!b.filled));
  const prepRows = frame.edit ? 5 : 6;
  // A "+N more" line takes a row itself, so one extra entry shows in its place.
  const prepShown = prepLines.length <= prepRows + 1 ? prepLines.length : prepRows;
  const blocked = !!v.magicBlockedBy;

  const held = (w: WeaponItem) => (inv.wielded[0] === w.id ? (inv.wielded[1] === w.id || w.size === 'heavy' ? 'both hands' : 'main') : inv.wielded[1] === w.id ? 'off' : '');
  const str = v.c.abilities.str;
  const weaponDamage = (w: WeaponItem) => (w.shield ? 'shield' : grips(w).map((x) => dice(w, undefined, x === 'two', str)).filter((d, i, all) => all.indexOf(d) === i).join(' / '));
  const reach = (w: WeaponItem) => (w.ranged ? `range ${w.range}` : [w.reach ? `reach ${w.reach}` : '', w.range ? `thrown ${w.range}` : ''].filter(Boolean).join(', '));
  const rules = v.c.rules;
  const talentName = (id: string) => v.talents.find((x) => x.id === id)?.name ?? id;

  const d = {
    name: v.c.name,
    title: v.title,
    brand: rules.id === 'mm' ? 'Materia Mundi' : rules.name,
    rulesName: rules.name,
    xp: v.xp,
    hp: v.c.hp,
    hpMax: v.c.hpMax,
    hitDie: v.hitDie,
    defense: g.defense || '—',
    wornName: g.worn?.name ?? '',
    attacks: v.attacks,
    carry: { load: v.carry.load, capacity: v.carry.capacity, threshold: v.carry.threshold, encumbered: v.carry.encumbered },
    mainName: g.main?.name ?? (v.live ? 'Empty' : ''),
    mainHeavy: g.main?.size === 'heavy',
    bothHands: g.bothHands,
    offName: g.bothHands ? 'Main weapon two-handed' : g.off?.name ?? (v.live ? 'Empty' : ''),
    offNote: g.off ? (g.off.shield ? 'Shield' : '+d6') : '',
    damage: g.damage,
    // What a damage roll on the card rolls: the main hand's weapon.
    mainDamage: 'main',
    abilities: v.abilities.map((a) => ({ id: a.id, name: a.name, short: a.short, score: a.score, save: a.save, threshold: a.threshold })),
    talents: v.talents.map((t) => ({ id: t.id, name: t.name, label: t.name + (t.expert ? '*' : ''), threshold: t.threshold, use: t.use, ability: t.ability })),
    talentColumns: v.abilities
      .filter((a) => v.talents.some((t) => t.ability === a.id))
      .map((a) => ({ id: a.id, talents: v.talents.filter((t) => t.ability === a.id).map((t) => ({ id: t.id, label: t.name + (t.expert ? '*' : ''), threshold: t.threshold })) })),
    features: v.features.map((f) => ({ name: f.name, summary: f.summary })),
    feats: v.levels.filter((l) => l.feat).map((l) => ({ level: l.level, feat: l.feat })),
    levels: v.levels.map((l) => ({ level: l.level, hp: l.hp, trained: l.training.length ? `Trained ${l.training.map(talentName).join(', ')}` : '', feat: l.feat ?? '' })),
    cls: { name: v.cls.name, book: v.cls.book ?? rules.name, page: v.cls.page, martial: v.cls.martial ?? '' },
    // Empty for a class without prepared magic.
    magic: { prepared: v.cls.magic ? `${v.cls.magic.prepared}s` : '', book: v.cls.magic?.book ?? '' },
    magicBlocked: blocked,
    prepLines: prepLines.slice(0, prepShown).map((l) => ({
      ...l,
      tag: circleTag(l.circle),
      empty: !l.filled,
      magic: l.magic || '—',
      text: l.filled ? `${l.spent ? '☒' : '☐'} ${circleTag(l.circle)} ${l.magic}` : `☐ ${circleTag(l.circle)}`,
      // A filled preparation can't be cast while blocked, but a spent one can still be prepared again.
      off: l.filled ? !l.spent && blocked : blocked
    })),
    prepMore: prepLines.length > prepShown ? `+${prepLines.length - prepShown} more` : '',
    cardItems: inv.items.slice(0, 5).map((i) => ({ label: itemLabel(i) })),
    cardItemsMore: inv.items.length > 5 ? `+${inv.items.length - 5} more` : '',
    equipped: WORN_SLOTS.map((s) => ({ id: s.id, label: s.label, name: inv.items.find((i) => i.id === inv.equipped?.[s.id])?.name ?? '' })),
    weapons: inv.weapons.map((w) => ({
      label: w.name + (held(w) ? ` (${held(w)})` : ''),
      damage: weaponDamage(w),
      info: w.size + (reach(w) ? `, ${reach(w)}` : ''),
      hit: w.shield ? '' : `${w.ranged ? v.attacks.ranged : v.attacks.melee}+`
    })),
    magicItems: v.magic.map((m) => ({ source: m.source, text: m.text })),
    items: inv.items.map((i) => ({ label: itemLabel(i) })),
    prepared: byCircle(inv.prepared).map(({ entry: p }) => ({ box: p.spent ? '☒' : '☐', circle: v.circle(p.circle), magic: p.magic })),
    book: byCircle(inv.book).map(({ entry: b }) => ({ circle: v.circle(b.circle), magic: b.magic })),
    followers: data.followers.map((f) => ({
      name: f.name,
      kind: f.kind === 'beast' ? `${f.hitDice} HD beast` : f.classId && rules.hasClass(f.classId) ? `L${f.level} ${f.origin && rules.hasOrigin(f.origin) ? rules.getOrigin(f.origin).name + ' ' : ''}${rules.getClass(f.classId).name}` : `L${f.level}`,
      hpMax: f.hpMax,
      attitude: f.attitude,
      notes: [f.traits.join(', '), f.notes].filter(Boolean).join('. ')
    }))
  };
  return { stats: parts.stats, gear: parts.gear, knowledge: parts.knowledge, flavor: parts.flavor, d, frame: { ...frame } };
}
