// Campaigns: a referee publishes a small file at a URL naming the ruleset and the
// equipment files for their game, and players point their app at it. Without one the
// app uses "This device", whose custom equipment file ("local") is edited in the app.
// Everything fetched is kept on the device so the game works offline.
// The format is in EQUIPMENT_FORMAT.md.

import { get, set } from 'idb-keyval';
import {
  EquipmentError, LOCAL_ID, checkEquipment, hasEquipment, isBuiltIn, registerEquipment, resolve, useCampaignEquipment,
  type EquipmentFileData, type EquipmentItem, type MagicEntry
} from '../equipment/equipment';
import { RULESETS, registerRuleset, type RulesetOptions } from '../rules/rules';
import { writeSheet, type SheetData } from './sheet';

export const CAMPAIGN_FORMAT = 'materia-mundi-campaign';

export interface CampaignData {
  format: typeof CAMPAIGN_FORMAT;
  version: number;
  id: string;
  name: string;
  referee?: string;
  // A built-in ruleset id ("mm"), or a link to a ruleset file.
  rules: string;
  // Built-in equipment file ids and/or links to equipment files, in priority order.
  equipment: string[];
}

// A campaign as fetched: the campaign file and every file it links to.
export interface CampaignCache {
  url: string;
  campaign: CampaignData;
  rules?: RulesetOptions;
  files: EquipmentFileData[];
  fetchedAt: string;
}

export class CampaignError extends Error {}

// Anything with a slash or ending in .json is a link, relative to the campaign file.
export const isLink = (s: string) => /[/]|\.json$/i.test(s);

export function checkCampaign(d: unknown): asserts d is CampaignData {
  const c = d as Partial<CampaignData> | null;
  if (!c || typeof c !== 'object' || c.format !== CAMPAIGN_FORMAT) throw new CampaignError("That link isn't a Materia Mundi campaign file");
  if (typeof c.name !== 'string' || !c.name.trim()) throw new CampaignError('The campaign file needs a "name"');
  if (typeof c.rules !== 'string' || !c.rules) throw new CampaignError('The campaign file needs "rules": a ruleset id like "mm", or a link');
  if (!Array.isArray(c.equipment) || !c.equipment.every((e) => typeof e === 'string')) throw new CampaignError('The campaign file needs an "equipment" list');
}

async function fetchJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    // A network error or a host that doesn't allow other sites to read it (CORS).
    throw new CampaignError(`Couldn't read ${url}. Check the link, that you're online, and that the host lets other sites read it (GitHub Pages, raw GitHub files and gists do; Google Drive doesn't).`);
  }
  if (!res.ok) throw new CampaignError(`Couldn't read ${url} (${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new CampaignError(`${url} isn't a JSON file`);
  }
}

export async function fetchCampaign(url: string): Promise<CampaignCache> {
  const campaign = await fetchJson(url);
  checkCampaign(campaign);
  const at = (link: string) => new URL(link, url).href;
  let rules: RulesetOptions | undefined;
  if (isLink(campaign.rules)) {
    rules = (await fetchJson(at(campaign.rules))) as RulesetOptions;
    if (!rules || typeof rules.id !== 'string') throw new CampaignError(`The campaign's ruleset at ${campaign.rules} has no "id"`);
  } else if (!RULESETS.some((r) => r.id === campaign.rules)) {
    throw new CampaignError(`This app doesn't have the ruleset "${campaign.rules}"`);
  }
  const files: EquipmentFileData[] = [];
  for (const e of campaign.equipment) {
    if (!isLink(e)) {
      if (!isBuiltIn(e)) throw new CampaignError(`This app doesn't have the equipment file "${e}"; link to it instead`);
      continue;
    }
    const data = await fetchJson(at(e));
    try {
      checkEquipment(data);
    } catch (err) {
      throw new CampaignError(`${e}: ${(err as Error).message}`);
    }
    if (isBuiltIn(data.id) || data.id === LOCAL_ID) throw new CampaignError(`${e} uses the id "${data.id}", which is taken; give it its own`);
    files.push(data);
  }
  return { url, campaign, rules, files, fetchedAt: new Date().toISOString() };
}

// The equipment file ids a campaign uses, in its order.
export function campaignFileIds(c: CampaignCache): string[] {
  let n = 0;
  return c.campaign.equipment.map((e) => (isLink(e) ? c.files[n++]?.id : e)).filter((id): id is string => !!id);
}

export function campaignRulesId(c: CampaignCache): string {
  return c.rules?.id ?? c.campaign.rules;
}

// Makes a campaign's ruleset and files known, so its characters open whichever
// campaign is active.
export function registerCampaign(c: CampaignCache) {
  if (c.rules) registerRuleset(c.rules);
  for (const f of c.files) registerEquipment(f);
}

export function activateCampaign(c: CampaignCache | null) {
  useCampaignEquipment(c ? campaignFileIds(c) : null);
}

export async function loadCampaigns(): Promise<Record<string, CampaignCache>> {
  return (await get<Record<string, CampaignCache>>('campaigns')) ?? {};
}

export async function saveCampaigns(all: Record<string, CampaignCache>) {
  await set('campaigns', JSON.parse(JSON.stringify(all)));
}

// This device's own equipment file.
export function blankLocal(): EquipmentFileData {
  return { format: 'materia-mundi-equipment', version: 1, id: LOCAL_ID, name: 'This device', rules: [], items: [], magic: [] };
}

export async function loadLocal(): Promise<EquipmentFileData> {
  const d = await get<EquipmentFileData>('equipment-local');
  try {
    if (d) {
      checkEquipment(d);
      return { ...d, id: LOCAL_ID };
    }
  } catch (e) {
    console.warn('Custom equipment file unreadable', e);
  }
  return blankLocal();
}

export async function saveLocal(d: EquipmentFileData) {
  await set('equipment-local', JSON.parse(JSON.stringify({ ...d, id: LOCAL_ID })));
}

// Entries that came bundled with imported characters, by file id, for files this device
// doesn't otherwise have.
export async function loadFallbacks(): Promise<Record<string, EquipmentFileData>> {
  return (await get<Record<string, EquipmentFileData>>('equipment-fallback')) ?? {};
}

async function saveFallbacks(all: Record<string, EquipmentFileData>) {
  await set('equipment-fallback', JSON.parse(JSON.stringify(all)));
}

export type CustomEntry = (EquipmentItem | MagicEntry) & { file: string };

function refsIn(v: unknown, out: Set<string>) {
  if (Array.isArray(v)) v.forEach((x) => refsIn(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if ((k === 'ref' || k === 'base') && typeof x === 'string' && /^[\w-]+:[\w-]+$/.test(x)) out.add(x);
      else refsIn(x, out);
    }
  }
}

// A sheet for a file: its custom entries (not from a built-in file) travel with it, so
// it opens on a device that doesn't have them.
export function exportSheet(d: SheetData): object {
  const sheet = writeSheet(d) as Record<string, unknown>;
  const refs = new Set<string>();
  refsIn(sheet.inventory, refs);
  const custom: CustomEntry[] = [];
  for (const ref of refs) {
    const file = ref.slice(0, ref.indexOf(':'));
    const entry = isBuiltIn(file) ? undefined : resolve(ref);
    if (entry) custom.push({ ...entry, file });
  }
  return custom.length ? { ...sheet, custom } : sheet;
}

export function exportSheets(list: SheetData[]) {
  return { format: 'materia-mundi-characters', version: 3, characters: list.map(exportSheet) };
}

// Before reading imported sheets: entries from this device's custom file go back into
// it (when missing), and entries from other files are kept as stand-ins until that
// file's campaign is loaded. Returns the local file if it changed.
export async function absorbCustom(data: unknown, local: EquipmentFileData): Promise<EquipmentFileData | null> {
  const sheets = Array.isArray(data) ? data : (data as { characters?: unknown[] })?.characters ?? [data];
  const entries = (sheets as { custom?: unknown }[]).flatMap((s) => (Array.isArray(s?.custom) ? (s.custom as CustomEntry[]) : []));
  if (!entries.length) return null;
  const fallbacks = await loadFallbacks();
  let localChanged = false;
  let fallbackChanged = false;
  for (const { file, ...entry } of entries) {
    if (typeof file !== 'string' || !entry?.id) continue;
    const isMagic = 'system' in entry;
    if (file === LOCAL_ID) {
      const list = (isMagic ? local.magic : local.items) as { id: string }[];
      if (![...local.items, ...local.magic].some((e) => e.id === entry.id)) {
        list.push(entry as never);
        localChanged = true;
      }
      continue;
    }
    if (isBuiltIn(file) || (hasEquipment(file) && !fallbacks[file])) continue;
    const f = (fallbacks[file] ??= { format: 'materia-mundi-equipment', version: 1, id: file, name: `${file} (from imported characters)`, rules: [], items: [], magic: [] });
    if (![...f.items, ...f.magic].some((e) => e.id === entry.id)) {
      ((isMagic ? f.magic : f.items) as { id: string }[]).push(entry as never);
      fallbackChanged = true;
    }
  }
  if (fallbackChanged) {
    await saveFallbacks(fallbacks);
    for (const f of Object.values(fallbacks)) {
      try {
        if (!hasEquipment(f.id) || f.name.endsWith('(from imported characters)')) registerEquipment(f);
      } catch (e) {
        if (!(e instanceof EquipmentError)) throw e;
      }
    }
  }
  return localChanged ? local : null;
}

// "Publish as campaign": the campaign file and a copy of this device's custom file with
// the campaign's own id, references inside it renamed to match.
export function publishCampaign(opts: { id: string; name: string; referee: string; rules: string; base: string[] }, local: EquipmentFileData) {
  const fileName = `${opts.id}-equipment.json`;
  const renamed = JSON.parse(JSON.stringify({ ...local, id: opts.id, name: opts.name }).replaceAll(`"${LOCAL_ID}:`, `"${opts.id}:`)) as EquipmentFileData;
  const hasCustom = local.items.length + local.magic.length > 0;
  const campaign: CampaignData = {
    format: CAMPAIGN_FORMAT,
    version: 1,
    id: opts.id,
    name: opts.name,
    ...(opts.referee ? { referee: opts.referee } : {}),
    rules: opts.rules,
    // After the rules' own files, which give the armor list.
    equipment: [...opts.base, ...(hasCustom ? [`./${fileName}`] : [])]
  };
  return { campaign, equipment: hasCustom ? { fileName, data: renamed } : null };
}
