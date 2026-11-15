// The core rules modules (modules/<id>-core/module.json, format hexmarch-rules/1) the app is built with:
// e9-core, and mm-core with its "e9" option (Materia Mundi for E9). Each built-in ruleset id
// ("e9", "mm", "e9mm") belongs to one module, or to one option inside it. The rules files themselves
// are compiled in through rules.ts and equipment.ts; this only reads who provides which ruleset.
// "private": true on a module hides its own rules from the pickers (Settings, new characters); on an option,
// that option. Sheets and campaigns that already use a private ruleset still open.

export interface CoreRules {
  // The ruleset id sheets record.
  ruleset: string;
  module: string;
  // The option inside the module ("e9" for Materia Mundi for E9), or '' for the module's own rules.
  option: string;
  title: string;
  version: string;
  // Not offered as a choice ("private": true in the manifest).
  private: boolean;
}

interface RulesManifest {
  format?: string;
  id?: string;
  title?: string;
  version?: string;
  ruleset?: string;
  private?: boolean;
  options?: { id?: string; title?: string; ruleset?: string; private?: boolean }[];
}

const manifests = import.meta.glob<RulesManifest>('../../../modules/*-core/module.json', { eager: true, import: 'default' });

export function coreRulesFrom(list: RulesManifest[]): Record<string, CoreRules> {
  const out: Record<string, CoreRules> = {};
  for (const m of list) {
    if (!m || !/^hexmarch-rules\//.test(m.format ?? '') || !m.id || !m.version) continue;
    if (m.ruleset) out[m.ruleset] = { ruleset: m.ruleset, module: m.id, option: '', title: m.title ?? m.id, version: m.version, private: m.private === true };
    for (const o of m.options ?? []) {
      if (o.ruleset && o.id) out[o.ruleset] = { ruleset: o.ruleset, module: m.id, option: o.id, title: o.title ?? o.id, version: m.version, private: o.private === true };
    }
  }
  return out;
}

export const CORE_RULES: Record<string, CoreRules> = coreRulesFrom(Object.values(manifests));
