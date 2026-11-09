// The sheet layouts the app is built with: each module folder's layout/ (SHEET_LAYOUT.md section 2),
// read and checked once. A ruleset uses its own module's layout, or e9-core's when its module has none
// (mm-core and its e9 option require e9-core, and share its card and page for now).
import { CORE_RULES } from '../../rules/core-modules';
import { scopeCss } from './css';
import { LayoutError, parseLayout, type LNode } from './parse';

export const SURFACES = ['card-front', 'card-back', 'page-1'] as const;
export type Surface = (typeof SURFACES)[number];

export interface Layout {
  module: string;
  // The class every surface of this layout carries; layout.css is scoped under it.
  scope: string;
  surfaces: Partial<Record<Surface, LNode[]>>;
  css: string;
  problems: string[];
}

const html = import.meta.glob<string>('../../../../modules/*/layout/*.html', { eager: true, query: '?raw', import: 'default' });
const styles = import.meta.glob<string>('../../../../modules/*/layout/layout.css', { eager: true, query: '?raw', import: 'default' });

export function buildLayout(module: string, files: Record<string, string>, css = ''): Layout {
  const scope = `lay-${module}`;
  const problems: string[] = [];
  const surfaces: Layout['surfaces'] = {};
  for (const [name, src] of Object.entries(files)) {
    const surface = name.replace(/\.html$/, '') as Surface;
    if (!(SURFACES as readonly string[]).includes(surface)) {
      problems.push(`${name}: not a surface (${SURFACES.join(', ')})`);
      continue;
    }
    try {
      surfaces[surface] = parseLayout(src);
    } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      problems.push(`${name}: ${e.message}`);
    }
  }
  let scoped = '';
  try {
    scoped = css ? scopeCss(css, `.${scope}`) : '';
  } catch (e) {
    if (!(e instanceof LayoutError)) throw e;
    problems.push(e.message);
  }
  return { module, scope, surfaces, css: scoped, problems };
}

function fromFiles(): Record<string, Layout> {
  const byModule: Record<string, Record<string, string>> = {};
  for (const [path, src] of Object.entries(html)) {
    const m = /modules\/([^/]+)\/layout\/([^/]+)$/.exec(path);
    if (m) (byModule[m[1]] ??= {})[m[2]] = src;
  }
  const out: Record<string, Layout> = {};
  for (const [module, files] of Object.entries(byModule)) {
    const css = Object.entries(styles).find(([p]) => p.includes(`/modules/${module}/layout/`))?.[1] ?? '';
    out[module] = buildLayout(module, files, css);
    for (const p of out[module].problems) console.warn(`Layout ${module}: ${p}`);
  }
  return out;
}

export const LAYOUTS: Record<string, Layout> = fromFiles();

export function layoutFor(ruleset: string): Layout | undefined {
  const own = CORE_RULES[ruleset]?.module;
  return (own && LAYOUTS[own]) || LAYOUTS['e9-core'];
}
