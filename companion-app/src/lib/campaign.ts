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
import { FORMAT_VERSION, PARTS, writeParts, type Part, type SheetData } from './sheet';

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
  // Link to the campaign's art file (portraits); art.json beside this file if left out.
  art?: string;
}

// A campaign as fetched: the campaign file and every file it links to.
export interface CampaignCache {
  url: string;
  campaign: CampaignData;
  rules?: RulesetOptions;
  files: EquipmentFileData[];
  fetchedAt: string;
  // A campaign made in E9 Scribe: where its modules are published.
  scribe?: { site: string };
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

// Campaigns made in E9 Scribe (data repo modules/SCRIBE.md section 1, step 7; Companion 0.5.14). A campaign
// is a private module, kept on the device that made it: Scribe saves it here as "scribe-campaign:<id>", and the
// Companion opens it by the link "scribe:<id>", with nothing to fetch. Its ruleset is its root's; its equipment
// is that ruleset's own. The state file Scribe wrote first is "state:<id>", as for any campaign.
export const SCRIBE_LINK = 'scribe:';
export const isScribeLink = (url: string) => url.startsWith(SCRIBE_LINK);

export interface ScribeCampaign {
  format: 'e9-scribe-campaign';
  version: number;
  id: string;
  // The data site the campaign's modules came from (its mm.json), ending in "/".
  site: string;
  // The ruleset id its root provides (state.rules.ruleset).
  ruleset: string;
  // The campaign module.json and campaign.lock.json as Scribe wrote them.
  manifest: { title?: string; requires?: Record<string, string> } & Record<string, unknown>;
  lock: unknown;
  saved: string;
}

export function fromScribe(url: string, d: unknown): CampaignCache {
  const r = d as Partial<ScribeCampaign> | null;
  if (!r || typeof r !== 'object' || r.format !== 'e9-scribe-campaign') throw new CampaignError("That isn't a campaign saved by E9 Scribe");
  if (typeof r.version !== 'number' || r.version > 1) throw new CampaignError('That campaign was saved by a newer Scribe. Update the app to open it.');
  if (typeof r.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(r.id)) throw new CampaignError('The campaign saved by Scribe has no id');
  const rules = RULESETS.find((x) => x.id === r.ruleset);
  if (!rules) throw new CampaignError(`This app doesn't have the ruleset "${r.ruleset}" the campaign plays with`);
  const own = rules.options.equipment;
  const campaign: CampaignData = {
    format: CAMPAIGN_FORMAT,
    version: 1,
    id: r.id,
    name: (typeof r.manifest?.title === 'string' && r.manifest.title.trim()) || r.id,
    rules: rules.id,
    equipment: (Array.isArray(own) ? own : [own]).filter((e) => isBuiltIn(e))
  };
  return { url, campaign, files: [], fetchedAt: typeof r.saved === 'string' ? r.saved : new Date().toISOString(), scribe: { site: typeof r.site === 'string' ? r.site : '' } };
}

export async function scribeCampaign(url: string): Promise<CampaignCache> {
  const id = url.slice(SCRIBE_LINK.length);
  const d = /^[a-z0-9-]{1,80}$/.test(id) ? await get(`scribe-campaign:${id}`) : undefined;
  if (!d) throw new CampaignError(`There's no campaign "${id}" saved by Scribe on this device. Scribe keeps campaigns on the device that made them.`);
  return fromScribe(url, d);
}

// A campaign by its link: fetched from the web, or read from Scribe's copy on this device.
export function openCampaignLink(url: string): Promise<CampaignCache> {
  return isScribeLink(url) ? scribeCampaign(url) : fetchCampaign(url);
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
// A character as exported, in parts (all four, or only those asked for). Custom equipment the gear
// uses travels with the gear.
export function exportSheet(d: SheetData, parts: readonly Part[] = PARTS): object {
  const sheet = writeParts(d, parts);
  if (!parts.includes('gear')) return sheet;
  const refs = new Set<string>();
  refsIn(sheet.gear, refs);
  const custom: CustomEntry[] = [];
  for (const ref of refs) {
    const file = ref.slice(0, ref.indexOf(':'));
    const entry = isBuiltIn(file) ? undefined : resolve(ref);
    if (entry) custom.push({ ...entry, file });
  }
  return custom.length ? { ...sheet, custom } : sheet;
}

export function exportSheets(list: SheetData[]) {
  return { format: 'materia-mundi-characters', version: FORMAT_VERSION, characters: list.map((d) => exportSheet(d)) };
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
