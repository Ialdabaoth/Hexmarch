import { describe, expect, it } from 'vitest';
import { damage, defaultLoadout, fitsOffHand, gearLoad, grips, newWeapon, parseKit, usesBothHands } from './gear';
import { Character, carrying, defaultTalents, equipment, freshState } from './character';
import { createSheet, readSheet } from './sheet';
import { rulesFor } from '../rules/rules';

const mm = rulesFor('mm');
const e9 = rulesFor('e9');
const a = { con: 0, str: 2, dex: 1, int: 0, wis: 0, cha: 0 };

describe('gear', () => {
  it('turns a class kit into armor, weapons and plain items', () => {
    const kit = parseKit(mm, 'Longsword, heavy armor, shield, two daggers, dungeoneer\'s kit');
    expect(kit.armor.map((x) => x.type)).toEqual(['heavy']);
    expect(kit.weapons.map((w) => w.type)).toEqual(['Longsword', 'Shield', 'Dagger', 'Dagger']);
    expect(kit.items.map((i) => [i.ref, i.name, i.qty])).toEqual([['mm:dungeoneers-kit', "Dungeoneer's kit", 1]]);
    expect(kit.weapons.map((w) => w.ref)).toEqual(['mm:longsword', 'mm:shield', 'mm:dagger', 'mm:dagger']);
    expect(kit.armor[0].ref).toBe('mm:heavy-armor');
  });

  it('starts a warrior in armor with sword and shield', () => {
    const s = createSheet({ name: 'W', origin: 'human', classId: 'warrior', abilities: a, talentBase: defaultTalents(a) });
    const g = equipment(new Character(s, freshState()));
    expect(g.worn?.type).toBe('heavy');
    expect(g.defense).toBe(3);
    expect(g.main?.type).toBe('Longsword');
    expect(g.off?.shield).toBe(true);
    expect(g.damage).toBe('d6+2');
  });

  it('works out damage by size and hands', () => {
    const sword = newWeapon(mm, 'Longsword');
    const dagger = newWeapon(mm, 'Dagger');
    expect(damage(sword, undefined, false, 1)).toBe('d6+1');
    expect(damage(sword, undefined, true, 1)).toBe('2d6');
    expect(damage(sword, dagger, false, 1)).toBe('d6+1+d6');
    expect(damage(newWeapon(mm, 'Greatsword'), undefined, true, 1)).toBe('2d6+1');
    expect(damage(newWeapon(mm, 'Longbow'), undefined, true, 3)).toBe('2d6');
    expect(damage({ ...dagger, bonus: 1 }, undefined, false, 0)).toBe('d6+1');
  });

  it('takes one hand for light weapons and shields, two for heavy, either for medium', () => {
    const shield = newWeapon(mm, 'Shield');
    const sword = newWeapon(mm, 'Longsword');
    const great = newWeapon(mm, 'Greatsword');
    expect(grips(shield)).toEqual(['one']);
    expect(grips(newWeapon(mm, 'Dagger'))).toEqual(['one']);
    expect(grips(great)).toEqual(['two']);
    expect(grips(sword)).toEqual(['one', 'two']);
    expect(usesBothHands(great, [great.id, ''])).toBe(true);
    expect(usesBothHands(sword, [sword.id, sword.id])).toBe(true);
    expect(usesBothHands(sword, [sword.id, shield.id])).toBe(false);
    expect(fitsOffHand(great, [great.id, ''], shield)).toBe(false);
    expect(fitsOffHand(sword, [sword.id, ''], shield)).toBe(true);
    expect(fitsOffHand(sword, [sword.id, ''], newWeapon(mm, 'Longsword'))).toBe(false);
  });

  it('holds a lone medium weapon two-handed to start', () => {
    const kit = parseKit(mm, 'Quarterstaff, medium armor');
    const { wielded } = defaultLoadout(kit.armor, kit.weapons);
    expect(wielded).toEqual([kit.weapons[0].id, kit.weapons[0].id]);
  });

  it('counts armor, heavy weapons, shields and polearms toward the load', () => {
    const kit = parseKit(mm, 'Halberd, medium armor, shield, dagger');
    expect(gearLoad(kit.armor, kit.weapons)).toBe(2 + 2 + 1);
    const s = createSheet({ name: 'W', origin: 'human', classId: 'warrior', abilities: a, talentBase: defaultTalents(a) });
    const carry = carrying(new Character(s, freshState()));
    expect(carry).toMatchObject({ capacity: 8, threshold: 4, load: 4, encumbered: false });
  });

  it('prefers a melee weapon in the main hand', () => {
    const kit = parseKit(mm, 'Light crossbow, two daggers, light armor');
    const { wielded } = defaultLoadout(kit.armor, kit.weapons);
    expect(wielded.map((id) => kit.weapons.find((w) => w.id === id)?.type)).toEqual(['Dagger', 'Dagger']);
  });

  it('upgrades version 1 armor and weapons', () => {
    const s = createSheet({ name: 'Old', origin: 'human', classId: 'warrior', abilities: a, talentBase: defaultTalents(a) });
    const v1 = JSON.parse(JSON.stringify(s));
    v1.version = 1;
    v1.inventory.armor = { rating: 2, worn: 'Chain shirt' };
    v1.inventory.weapons = [
      { name: 'Longsword', damage: 'd6+2', range: 'melee' },
      { name: 'Sling', damage: 'd6', range: 'ranged' }
    ];
    delete v1.inventory.worn;
    delete v1.inventory.wielded;
    const back = readSheet(v1);
    expect(back.inventory.armor).toMatchObject([{ name: 'Chain shirt', type: 'medium' }]);
    expect(back.inventory.worn).toBe(back.inventory.armor[0].id);
    expect(back.inventory.weapons[0]).toMatchObject({ type: 'Longsword', size: 'medium' });
    expect(back.inventory.weapons[1]).toMatchObject({ name: 'Sling', ranged: true });
    expect(back.inventory.wielded[0]).toBe(back.inventory.weapons[0].id);
  });

  it('round-trips worn and wielded items', () => {
    const s = createSheet({ name: 'W', origin: 'human', classId: 'warrior', abilities: a, talentBase: defaultTalents(a) });
    expect(readSheet(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
