import { describe, expect, it } from 'vitest';
import { Character, attackThresholds, defaultTalents, equipment, freshState, saveThreshold } from './character';
import { createSheet, readSheet } from './sheet';
import { newArmor, newWeapon, itemId } from './gear';
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
    // A dweomer needs a masterwork base: +1 damage even though the sheet says 0.
    expect(g.damage).toBe('d6+3+3d6');
    expect(g.damageTypes).toBe('slashing, 3d6 fire');
    // A magic weapon is at least +1 to attack.
    expect(attackThresholds(c).melee).toBe(attackThresholds(live(warrior())).melee - 1);
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
    expect(attackThresholds(c).ranged).toBe(attackThresholds(live(warrior())).ranged - 2);
    expect(attackThresholds(c).melee).toBe(attackThresholds(live(warrior())).melee);
    expect(equipment(c).damage).toBe('2d6+2');
    expect(equipment(c).damageTypes).toBe('piercing');
  });

  it('uses the element an elemental item was made with, and keeps it on the sheet', () => {
    const s = warrior();
    s.inventory.weapons[0].enchantment = { ref: 'mm:tincture-of-elemental-essence', name: 'Tincture', element: 'lightning' };
    const back = readSheet(JSON.parse(JSON.stringify(s)));
    expect(back.inventory.weapons[0].enchantment?.element).toBe('lightning');
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
