import { afterEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => store.get(k),
  set: async (k: string, v: unknown) => void store.set(k, v)
}));

import {
  absorbCustom, activateCampaign, blankLocal, campaignFileIds, checkCampaign, exportSheet, fetchCampaign, publishCampaign,
  registerCampaign, type CampaignData
} from './campaign';
import { catalogFor, registerEquipment, resolve, type EquipmentFileData } from '../equipment/equipment';
import { rulesFor } from '../rules/rules';
import { createSheet, readSheet } from './sheet';
import { defaultTalents } from './character';
import { newWeapon } from './gear';

const abilities = { con: 0, str: 1, dex: 0, int: 0, wis: 0, cha: 0 };
const fighter = () =>
  createSheet({ name: 'Brand', origin: 'human', classId: 'warrior', abilities, talentBase: defaultTalents(abilities) });

function localFile(): EquipmentFileData {
  return {
    ...blankLocal(),
    items: [{ id: 'falchion', name: 'Falchion', kind: 'weapon', size: 'medium', cost: 30, properties: ['Slashing'] }],
    magic: [{ id: 'ember-ward', name: 'Ember Ward', system: 'arcane', circle: 1, summary: 'Wards off fire.' }]
  };
}

const campaign: CampaignData = {
  format: 'materia-mundi-campaign', version: 1, id: 'pale', name: 'The Pale', rules: 'mm', equipment: ['mm', './pale-equipment.json']
};
const paleFile: EquipmentFileData = {
  format: 'materia-mundi-equipment', version: 1, id: 'pale', name: 'The Pale', rules: ['mm'],
  items: [{ id: 'pale-pike', name: 'Pale pike', kind: 'weapon', size: 'heavy', reach: 1 }], magic: []
};

afterEach(() => {
  activateCampaign(null);
  vi.unstubAllGlobals();
});

describe('campaigns', () => {
  it('checks campaign files', () => {
    expect(() => checkCampaign(campaign)).not.toThrow();
    expect(() => checkCampaign({ ...campaign, format: 'x' })).toThrow(/campaign file/);
    expect(() => checkCampaign({ ...campaign, equipment: 'mm' })).toThrow(/equipment/);
  });

  it('fetches a campaign and the files it links to, relative to it', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);
      const body = url.endsWith('campaign.json') ? campaign : paleFile;
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const c = await fetchCampaign('https://example.org/games/campaign.json');
    expect(fetched).toEqual(['https://example.org/games/campaign.json', 'https://example.org/games/pale-equipment.json']);
    expect(campaignFileIds(c)).toEqual(['mm', 'pale']);

    registerCampaign(c);
    activateCampaign(c);
    const cat = rulesFor('mm').equipment;
    // The rules' arms list plus the campaign's own weapons.
    expect(cat.catalog().armor.map((a) => a.type)).toEqual(['light', 'medium', 'heavy']);
    expect(cat.findItem('Pale pike', ['weapon'])?.ref).toBe('pale:pale-pike');
    expect(newWeapon(rulesFor('mm'), 'Pale pike').ref).toBe('pale:pale-pike');
  });

  it('says why a link failed', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchCampaign('https://drive.example/x.json')).rejects.toThrow(/lets other sites read it/);
  });

  it("adds this device's custom file to every catalog", () => {
    registerEquipment(localFile());
    expect(catalogFor(['mm']).findMagic('Ember Ward', 'arcane')?.ref).toBe('local:ember-ward');
    expect(catalogFor(['mm']).findItem('Falchion', ['weapon'])?.ref).toBe('local:falchion');
    // Built-in second files don't add weapons: E9 keeps its own arms list.
    expect(catalogFor(["e9", "mm"]).catalog().weapons.some((w) => w.type === 'Shortsword')).toBe(rulesFor('e9').gear.weapons.some((w) => w.type === 'Shortsword'));
  });

  it('carries custom entries with an exported character, and takes them in on import', async () => {
    registerEquipment(localFile());
    const s = fighter();
    s.inventory.weapons.push(newWeapon(rulesFor('mm'), 'Falchion'));
    const out = exportSheet(s) as { custom?: { id: string; file: string }[] };
    expect(out.custom).toEqual([expect.objectContaining({ id: 'falchion', file: 'local', cost: 30 })]);
    expect(readSheet(out).inventory.weapons.at(-1)?.ref).toBe('local:falchion');

    // On another device without it, the entry goes into that device's custom file.
    const other = blankLocal();
    const changed = await absorbCustom(out, other);
    expect(changed?.items.map((i) => i.id)).toEqual(['falchion']);
    expect(await absorbCustom(out, changed!)).toBeNull();

    // Entries from another campaign's file are kept as stand-ins.
    const foreign = { ...out, custom: [{ id: 'rune-axe', name: 'Rune axe', kind: 'weapon', size: 'medium', file: 'norse' }] };
    await absorbCustom(foreign, blankLocal());
    expect(resolve('norse:rune-axe')?.name).toBe('Rune axe');
  });

  it('publishes custom equipment as a campaign with its own id', () => {
    const local = localFile();
    local.magic.push({ id: 'ember-blade', name: 'Ember Blade', system: 'dweomer', form: 'weapon', base: 'local:falchion' });
    const out = publishCampaign({ id: 'pale', name: 'The Pale', referee: 'Brent', rules: 'mm', base: ['mm'] }, local);
    expect(out.campaign).toEqual({
      format: 'materia-mundi-campaign', version: 1, id: 'pale', name: 'The Pale', referee: 'Brent', rules: 'mm', equipment: ['mm', './pale-equipment.json']
    });
    expect(out.equipment?.fileName).toBe('pale-equipment.json');
    expect(out.equipment?.data.id).toBe('pale');
    expect(out.equipment?.data.magic[1].base).toBe('pale:falchion');
    expect(publishCampaign({ id: 'x', name: 'X', referee: '', rules: 'mm', base: ['mm'] }, blankLocal()).equipment).toBeNull();
  });

  it('remembers which campaign a character was made for', () => {
    const s = createSheet({ name: 'Ada', campaign: 'pale', origin: 'human', classId: 'warrior', abilities, talentBase: defaultTalents(abilities) });
    expect(readSheet(JSON.parse(JSON.stringify(s))).campaign).toBe('pale');
    expect(() => readSheet({ ...s, rules: 'norse-rules', campaign: 'norse' })).toThrow(/campaign "norse"/);
  });
});
