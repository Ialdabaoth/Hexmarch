import { describe, expect, it } from 'vitest';
import { Character, attackThresholds, defaultTalents, equipment, freshState, saveThreshold } from './character';
import { createSheet, readSheet } from './sheet';
import { newArmor, newWeapon, itemId } from './gear';
import { damageLine, damageRoll } from './checks';
import { describeEffect, physicalType, scaleDice } from './magic-effects';
import { rulesFor } from '../rules/rules';

const mm = rulesFor('mm');
const a = { con: 0, str: 2, dex: 1, int: 0, wis: 0, cha: 0 };
const warrior = () => createSheet({ name: 'W', origin: 'human', classId: 'warrior', abilities: a, talentBase: defaultTalents(a) });
const live = (s: ReturnType<typeof warrior>) => new Character(s, freshState());

describe('magic item effects', () => {
  it('adds an elemental weapon\'s dice and damage type, scaled by rarity', () => {
    const s = warrior();
    const sword = s.inventory.weapons.find((w) => w.type === 'Longsword')!;
    sword.enchantment = { ref: 'mm:flametongue', name: 'Flametongue', rarity: 'rare' };
    const c = live(s);
    const g = equipment(c);
    // The dweomer's damage replaces the masterwork +1.
    expect(g.damage).toBe('d6+2+3d6');
    expect(g.damageTypes).toBe('slashing, 3d6 fire');
    expect(damageRoll({ who: 'W', label: 'Damage', parts: g.damageParts }, () => 0).parts).toEqual([{ amount: 3, type: 'slashing' }, { amount: 3, type: 'fire' }]);
    // There are no attack bonuses.
    expect(attackThresholds(c)).toEqual(attackThresholds(live(warrior())));
    expect(c.magic.lines()).toContainEqual({ source: sword.name, text: '+3d6 fire damage (melee)' });
  });

  it('counts only the best bonus, and lifts abilities past +3', () => {
    const s = warrior();
    s.inventory.items.push(
      { id: itemId(), name: 'Belt', qty: 1, enchantment: { ref: 'mm:belt-of-feral-might', name: 'Belt of Feral Might', rarity: 'legendary' } },
      { id: itemId(), name: 'Lesser belt', qty: 1, enchantment: { ref: 'mm:belt-of-feral-might', name: 'Belt of Feral Might', rarity: 'uncommon' } }
    );
    const c = live(s);
    expect(c.abilities.str).toBe(5);
    expect(c.abilities.con).toBe(3);
    expect(c.sheet.ability('str')).toBe(2);
    expect(saveThreshold(c, 'con')).toBe(saveThreshold(live(warrior()), 'con') - 3);
  });

  it("leaves potions alone until they're drunk", () => {
    const s = warrior();
    s.inventory.items.push({ id: itemId(), name: 'Elixir', qty: 1, enchantment: { ref: 'mm:elixir-of-giant-growth', name: 'Elixir of Giant Growth' } });
    expect(live(s).abilities.str).toBe(2);
    expect(live(s).magic.active).toEqual([]);
  });

  it('gives armor dweomers a masterwork base and applies set defense', () => {
    const s = warrior();
    const plate = s.inventory.armor[0];
    plate.enchantment = { ref: 'mm:orichalc-plate', name: 'Orichalc Plate' };
    expect(equipment(live(s)).defense).toBe(3 + 1 + 1);

    const robed = warrior();
    const robes = newArmor(mm, 'light', 'Robes');
    robes.enchantment = { ref: 'mm:mage-robes', name: 'Mage Robes', rarity: 'legendary' };
    robed.inventory.armor = [robes];
    robed.inventory.worn = robes.id;
    expect(equipment(live(robed)).defense).toBe(4);
  });

  it('checks what armor is worn and which attack is made', () => {
    const s = warrior();
    s.inventory.items.push({ id: itemId(), name: 'Golem leg', qty: 1, enchantment: { ref: 'mm:golem-prosthesis-leg', name: 'Golem Prosthesis (leg)', rarity: 'rare' } });
    expect(equipment(live(s)).defense).toBe(3);
    s.inventory.worn = '';
    expect(equipment(live(s)).defense).toBe(2);

    const archer = warrior();
    const bow = newWeapon(mm, 'Longbow');
    bow.enchantment = { ref: 'mm:windbow', name: 'Windbow', rarity: 'uncommon' };
    archer.inventory.weapons.push(bow);
    archer.inventory.wielded = [bow.id, bow.id];
    const c = live(archer);
    expect(attackThresholds(c)).toEqual(attackThresholds(live(warrior())));
    expect(equipment(c).damage).toBe('2d6+2');
    expect(equipment(c).damageTypes).toBe('piercing');
  });

  it('uses the element an elemental item was made with, and keeps it on the sheet', () => {
    const s = warrior();
    s.inventory.weapons[0].enchantment = { ref: 'mm:tincture-of-elemental-essence', name: 'Tincture', element: 'lightning' };
    const back = readSheet(JSON.parse(JSON.stringify(s)));
    expect(back.inventory.weapons[0].enchantment?.element).toBe('lightning');
  });

  it('gives masterwork weapons +1 damage, kept by a dweomer with no damage of its own', () => {
    const s = warrior();
    const bow = newWeapon(mm, 'Shortbow');
    bow.bonus = 1;
    s.inventory.weapons.push(bow);
    s.inventory.wielded = [bow.id, ''];
    expect(equipment(live(s)).damage).toBe('d6+1');
    const sword = s.inventory.weapons.find((w) => w.type === 'Longsword')!;
    sword.enchantment = { ref: 'mm:keen-blade', name: 'Keen Blade' };
    s.inventory.wielded = [sword.id, ''];
    expect(equipment(live(s)).damage).toBe('d6+3');
  });

  it('makes a firearm deal its piercing damage again as thunder', () => {
    const s = warrior();
    const gun = newWeapon(mm, 'Crossbow');
    gun.enchantment = { ref: 'mm:firearm', name: 'Firearm', rarity: 'uncommon' };
    s.inventory.weapons.push(gun);
    s.inventory.wielded = [gun.id, gun.id];
    const g = equipment(live(s));
    expect(g.damage).toBe('(d6)×2');
    expect(g.damageTypes).toBe('piercing, equal thunder');
    expect(live(s).magic.lines()[0].text).toBe('An equal amount of thunder damage');
    const hit = damageRoll({ who: 'W', label: 'Damage', parts: g.damageParts }, () => 0.5);
    expect(hit.parts).toEqual([{ amount: 4, type: 'piercing' }, { amount: 4, type: 'thunder' }]);
    expect(hit.total).toBe(8);
    expect(damageLine(hit)).toBe('4 piercing + 4 thunder');
  });

  it("gives e9mm's magic weapons dice by size, uncommon only", () => {
    const e9mm = rulesFor('e9mm');
    const s = createSheet({ rules: 'e9mm', name: 'D', origin: 'human', classId: 'fighter', abilities: a, talentBase: defaultTalents(a) });
    const sword = s.inventory.weapons.find((w) => w.type === 'Longsword')!;
    // An older sheet points at the Compendium's Flametongue; it moves to e9mm's.
    sword.enchantment = { ref: 'mm:flametongue', name: 'Flametongue', rarity: 'legendary' };
    const back = readSheet(JSON.parse(JSON.stringify(s)));
    expect(back.inventory.weapons.find((w) => w.id === sword.id)!.enchantment).toEqual({ ref: 'e9mm:flametongue', name: 'Flametongue' });
    expect(e9mm.equipment.findMagic('Flametongue', 'dweomer')?.rarity).toBe('uncommon');
    sword.enchantment = back.inventory.weapons.find((w) => w.id === sword.id)!.enchantment;
    const g = equipment(live(s));
    expect(g.damage).toBe('d6+2+2d6');
    expect(g.damageTypes).toBe('slashing, 2d6 fire');
    // The Compendium's version is unchanged for Materia Mundi characters.
    expect(rulesFor('mm').equipment.findMagic('Flametongue', 'dweomer')?.ref).toBe('mm:flametongue');

    // Keen blade: more dice of the weapon's own kind, in the same roll.
    sword.enchantment = { ref: 'e9mm:keen-blade', name: 'Keen Blade' };
    expect(equipment(live(s)).damageParts).toEqual([{ expression: 'd6+2+2d6', type: 'slashing' }]);

    // A quiver charges ammunition by the bow's size.
    const bow = newWeapon(e9mm, 'Longbow');
    s.inventory.weapons.push(bow);
    s.inventory.wielded = [bow.id, bow.id];
    s.inventory.items.push({ id: itemId(), name: 'Quiver', qty: 1, enchantment: { ref: 'e9mm:quiver-of-elemental-bolts', name: 'Quiver', element: 'cold' } });
    const q = equipment(live(s));
    expect(q.damageTypes).toBe(`piercing, ${bow.size === 'heavy' ? 3 : 2}d6 cold`);
  });

  it('turns damage into another type', () => {
    const s = warrior();
    s.inventory.weapons[0].enchantment = { ref: 'mm:aetheric-blade', name: 'Aetheric Blade' };
    expect(equipment(live(s)).damageTypes).toBe('piercing or aetheric');
  });

  it('describes effects in words', () => {
    expect(describeEffect({ resist: 'psychic', mode: 'half' }, 0)).toBe('Half psychic damage');
    expect(describeEffect({ damage: '1d6', type: 'elemental', per: 'level' }, 1, 'cold')).toBe('+2d6 cold damage');
    expect(describeEffect({ easier: 'save:doom', vs: 'poison', lasts: '2d6 rounds' }, 0)).toBe('Easy saves vs. Doom, vs. poison, for 2d6 rounds');
    expect(describeEffect({ bonus: 'defense', amount: 'rarity', when: { armor: ['none', 'light'] } }, 2)).toBe('+2 defense (in light armor or none)');
    expect(scaleDice('2d6', 3)).toBe('6d6');
    expect(physicalType(newWeapon(mm, 'Maul'))).toBe('blunt');
    expect(physicalType(newWeapon(mm, 'Shortbow'))).toBe('piercing');
    expect(physicalType(undefined)).toBe('blunt');
  });
});
