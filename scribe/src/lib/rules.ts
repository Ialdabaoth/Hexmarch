// The root rules modules Scribe offers in step 1, from modules/*-core/module.json (e9-rules/1), the same
// manifests the Companion is built with. Each module, and each option inside one, is a choice.

export interface RootChoice {
  module: string;
  option: string; // '' for the module's own rules
  ruleset: string;
  title: string;
  version: string;
}

type Raw = { format?: string; kind?: string; id?: string; title?: string; version?: string; ruleset?: string; options?: { id?: string; title?: string; ruleset?: string }[] };

export function rootChoices(list: Raw[]): RootChoice[] {
  const out: RootChoice[] = [];
  for (const m of list) {
    if (!m?.id || !m.version || m.kind !== 'rules') continue;
    if (m.ruleset) out.push({ module: m.id, option: '', ruleset: m.ruleset, title: m.title ?? m.id, version: m.version });
    for (const o of m.options ?? []) {
      if (o.id && o.ruleset) out.push({ module: m.id, option: o.id, ruleset: o.ruleset, title: o.title ?? `${m.title} (${o.id})`, version: m.version });
    }
  }
  return out;
}

const manifests = import.meta.glob<Raw>('../../../modules/*-core/module.json', { eager: true, import: 'default' });
export const RULES_MANIFESTS: Raw[] = Object.values(manifests);
export const ROOTS: RootChoice[] = rootChoices(RULES_MANIFESTS);
