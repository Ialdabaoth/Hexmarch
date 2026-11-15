// The root rules modules Scribe offers in step 1, from modules/*-core/module.json (hexmarch-rules/1), the same
// manifests the Companion is built with. Each module, and each option inside one, is a choice, unless it says
// "private": true. A private module's own rules are hidden but its options stay offered unless they are private too.

export interface RootChoice {
  module: string;
  option: string; // '' for the module's own rules
  ruleset: string;
  title: string;
  version: string;
}

type Raw = { format?: string; kind?: string; id?: string; title?: string; version?: string; ruleset?: string; private?: boolean; options?: { id?: string; title?: string; ruleset?: string; private?: boolean }[] };

export function rootChoices(list: Raw[]): RootChoice[] {
  const out: RootChoice[] = [];
  for (const m of list) {
    if (!m?.id || !m.version || m.kind !== 'rules') continue;
    if (m.ruleset && m.private !== true) out.push({ module: m.id, option: '', ruleset: m.ruleset, title: m.title ?? m.id, version: m.version });
    for (const o of m.options ?? []) {
      if (o.id && o.ruleset && o.private !== true) out.push({ module: m.id, option: o.id, ruleset: o.ruleset, title: o.title ?? `${m.title} (${o.id})`, version: m.version });
    }
  }
  return out;
}

const manifests = import.meta.glob<Raw>('../../../modules/*-core/module.json', { eager: true, import: 'default' });
export const RULES_MANIFESTS: Raw[] = Object.values(manifests);
export const ROOTS: RootChoice[] = rootChoices(RULES_MANIFESTS);
