// A layout's own stylesheet (SHEET_LAYOUT.md section 5): class selectors and plain properties only,
// scoped to the layout's surfaces. No @import, no url(), no fixed positioning, no fonts of its own.
import { LayoutError, PLAIN } from './parse';

// Element names a selector may use: the layout's own elements, and what the Companion's elements
// render as (roll and action buttons, the portrait's picture).
const TAGS = new Set([...PLAIN, 'button', 'img', 'label', 'a']);

// Pseudo-classes a layout may use; anything else (and every pseudo-element) is refused.
const PSEUDO = new Set(['disabled', 'active', 'hover', 'first-child', 'last-child', 'empty']);
// One compound selector: an optional element name or *, then classes and pseudo-classes:
// li.empty, .a.b:disabled, .tap:not(:disabled):active.
const COMPOUND = /^([a-z][a-z0-9]*|\*)?(\.[a-zA-Z][\w-]*)*(:(?:[a-z-]+|not\((?:\.[a-zA-Z][\w-]*)*(?::[a-z-]+)?\)))*$/;
const FONT_WORDS = new Set(['georgia', 'serif', 'sans-serif', 'system-ui', 'monospace', 'inherit', 'normal', 'italic', 'bold', 'bolder', 'lighter', 'small-caps', 'oblique']);
const BANNED = /url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:|position\s*:\s*(fixed|sticky)|\\/i;

function checkSelector(sel: string): string {
  const parts = sel.trim().split(/\s*([>+~])\s*|\s+/).filter((p) => p !== undefined && p !== '');
  for (const p of parts) {
    if (p === '>' || p === '+' || p === '~') continue;
    const tag = /^[a-z][a-z0-9]*/.exec(p)?.[0];
    if (!COMPOUND.test(p) || (tag && !TAGS.has(tag))) throw new LayoutError(`layout.css: "${sel.trim()}" may use only classes and the layout's own elements`);
    for (const m of p.matchAll(/:([a-z-]+)/g)) if (m[1] !== 'not' && !PSEUDO.has(m[1])) throw new LayoutError(`layout.css: ":${m[1]}" isn't allowed`);
  }
  return parts.join(' ').replace(/ ([>+~]) /g, ' $1 ');
}

function checkBody(body: string): string {
  for (const decl of body.split(';')) {
    if (!decl.trim()) continue;
    const m = /^\s*(-?[a-z][a-z-]*)\s*:\s*([^]*)$/.exec(decl);
    if (!m) throw new LayoutError(`layout.css: can't read "${decl.trim()}"`);
    if (m[1] === 'font-family' || m[1] === 'font') {
      // Fonts come from the root stylesheet: only its families (and the generic ones) may be named.
      const words = m[2].toLowerCase().replace(/[\d.]+[a-z%]*|\/|,/g, ' ').split(/\s+/).filter(Boolean);
      for (const w of words) if (!FONT_WORDS.has(w.replace(/["']/g, ''))) throw new LayoutError(`layout.css: the font "${w}" isn't one of the root stylesheet's`);
    }
  }
  return body.trim();
}

// Checks a layout stylesheet and returns it with every selector inside `scope` (a class selector).
// `@media print { … }` and `@media (min-width: Npx) { … }` blocks are allowed around rules.
export function scopeCss(src: string, scope: string): string {
  const css = src.replace(/\/\*[^]*?\*\//g, '');
  if (BANNED.test(css)) throw new LayoutError(`layout.css: "${BANNED.exec(css)![0]}" isn't allowed`);
  const out: string[] = [];
  let i = 0;
  const rules = (text: string): string[] => {
    const res: string[] = [];
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sels = m[1].split(',').map(checkSelector).map((s) => `${scope} ${s}`);
      res.push(`${sels.join(', ')} { ${checkBody(m[2])} }`);
    }
    const rest = text.replace(/([^{}]+)\{([^{}]*)\}/g, '').trim();
    if (rest) throw new LayoutError(`layout.css: can't read "${rest.slice(0, 40)}"`);
    return res;
  };
  while (i < css.length) {
    const at = css.indexOf('@', i);
    if (at < 0) {
      out.push(...rules(css.slice(i)));
      break;
    }
    out.push(...rules(css.slice(i, at)));
    const m = /^@media\s+(print|\(\s*(?:min|max)-width\s*:\s*\d+px\s*\))\s*\{/.exec(css.slice(at));
    if (!m) throw new LayoutError(`layout.css: "${css.slice(at, at + 30).trim()}" isn't allowed; only @media print and @media (min-width: Npx)`);
    // The block runs to its matching brace.
    let depth = 1, j = at + m[0].length;
    for (; j < css.length && depth; j++) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0;
    if (depth) throw new LayoutError('layout.css: an @media block is never closed');
    out.push(`@media ${m[1]} { ${rules(css.slice(at + m[0].length, j - 1)).join(' ')} }`);
    i = j;
  }
  return out.join('\n');
}
