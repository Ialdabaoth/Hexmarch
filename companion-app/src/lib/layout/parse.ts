// Sheet layouts (modules/SHEET_LAYOUT.md in the data repo): a module places values and roll buttons on
// the Companion's surfaces with a whitelist of HTML elements plus a few Companion elements. Layouts come
// from other authors, so this reads them into plain nodes and refuses anything off the list: no
// scripts, no event attributes, no links, no images but the portrait slot. Nothing here touches the DOM.

export class LayoutError extends Error {}

export type Print = 'only' | 'never';

interface Common {
  // Classes from the layout, and classes switched on by a value: "over:d.carry.encumbered".
  cls: string;
  when: { cls: string; key: string }[];
  print?: Print;
}

export type LNode =
  | { t: 'text'; text: string }
  | ({ t: 'el'; tag: string; children: LNode[] } & Common)
  | ({ t: 'value'; key: string; format?: 'signed'; fallback?: string } & Common)
  | ({ t: 'roll'; check: Check; key: string; label?: string; min?: number; children: LNode[] } & Common)
  | ({ t: 'action'; do: Action; key?: string; off?: string; children: LNode[] } & Common)
  | ({ t: 'each'; list: string; as: string; max?: number; min?: number; more?: string; children: LNode[] } & Common)
  | ({ t: 'if'; key: string; not: boolean; children: LNode[] } & Common)
  | ({ t: 'portrait' } & Common)
  | ({ t: 'ref'; ref: string; children: LNode[] } & Common);

export const PLAIN = new Set(['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'small', 'b', 'i', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'header', 'footer', 'section']);
const VOID = new Set(['br', 'hr', 'e9-portrait']);
export const CHECKS = ['talent', 'save', 'attack', 'damage', 'dice'] as const;
export type Check = (typeof CHECKS)[number];
// Taps that open one of the Companion's own editors instead of rolling. On paper they are plain text.
export const ACTIONS = ['hp', 'xp', 'armor', 'main', 'off', 'carry', 'prep', 'prepslot', 'equip'] as const;
export type Action = (typeof ACTIONS)[number];

const KEY = /^[a-zA-Z][\w]*(\.[\w]+)*$/;
const CLASS = /^[a-zA-Z][\w-]*$/;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', times: '×', minus: '−' };
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

interface Tag { name: string; attrs: Record<string, string>; close: boolean; selfClose: boolean; line: number }

// A small, strict tokenizer: tags, text and comments. Attribute values are quoted.
function* tokens(src: string): Generator<Tag | { text: string }> {
  let i = 0;
  const line = (at: number) => src.slice(0, at).split('\n').length;
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) throw new LayoutError(`line ${line(i)}: a comment is never closed`);
      i = end + 3;
      continue;
    }
    if (src[i] === '<') {
      const m = /^<(\/?)([a-zA-Z][\w-]*)((?:\s+[a-zA-Z][\w-]*(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>/.exec(src.slice(i));
      if (!m) throw new LayoutError(`line ${line(i)}: can't read the tag starting "${src.slice(i, i + 24)}"`);
      const attrs: Record<string, string> = {};
      for (const a of m[3].matchAll(/([a-zA-Z][\w-]*)(?:\s*=\s*"([^"]*)")?/g)) {
        const name = a[1].toLowerCase();
        if (name in attrs) throw new LayoutError(`line ${line(i)}: "${name}" given twice`);
        attrs[name] = decode(a[2] ?? '');
      }
      yield { name: m[2].toLowerCase(), attrs, close: m[1] === '/', selfClose: m[4] === '/', line: line(i) };
      i += m[0].length;
      continue;
    }
    const next = src.indexOf('<', i);
    const text = src.slice(i, next < 0 ? src.length : next);
    if (text) yield { text: decode(text) };
    i = next < 0 ? src.length : next;
  }
}

function common(tag: Tag, allowed: string[]): Common {
  for (const a of Object.keys(tag.attrs)) {
    if (!['class', 'data-print', 'e9-class', ...allowed].includes(a)) throw new LayoutError(`line ${tag.line}: <${tag.name}> can't have "${a}"`);
  }
  const cls = (tag.attrs.class ?? '').split(/\s+/).filter(Boolean);
  for (const c of cls) if (!CLASS.test(c)) throw new LayoutError(`line ${tag.line}: "${c}" isn't a class name`);
  const when = (tag.attrs['e9-class'] ?? '').split(/\s+/).filter(Boolean).map((w) => {
    const [c, key] = w.split(':');
    if (!c || !CLASS.test(c) || !key || !KEY.test(key)) throw new LayoutError(`line ${tag.line}: e9-class "${w}" should read class:value`);
    return { cls: c, key };
  });
  const print = tag.attrs['data-print'];
  if (print !== undefined && print !== 'only' && print !== 'never') throw new LayoutError(`line ${tag.line}: data-print is "only" or "never"`);
  return { cls: cls.join(' '), when, ...(print ? { print } : {}) };
}

function key(tag: Tag, attr: string, required = true): string {
  const k = tag.attrs[attr];
  if (k === undefined) {
    if (required) throw new LayoutError(`line ${tag.line}: <${tag.name}> needs ${attr}="…"`);
    return '';
  }
  if (!KEY.test(k)) throw new LayoutError(`line ${tag.line}: ${attr}="${k}" isn't a value name`);
  return k;
}

function count(tag: Tag, attr: string): number | undefined {
  const v = tag.attrs[attr];
  if (v === undefined) return undefined;
  if (!/^\d{1,3}$/.test(v)) throw new LayoutError(`line ${tag.line}: ${attr} should be a whole number`);
  return Number(v);
}

function node(tag: Tag, children: LNode[]): LNode {
  const n = tag.name;
  if (PLAIN.has(n)) return { t: 'el', tag: n, children, ...common(tag, []) };
  switch (n) {
    case 'e9-value': {
      const format = tag.attrs.format;
      if (format !== undefined && format !== 'signed') throw new LayoutError(`line ${tag.line}: format is "signed" or left out`);
      return { t: 'value', key: key(tag, 'key'), ...(format ? { format } : {}), ...(tag.attrs.empty !== undefined ? { fallback: tag.attrs.empty } : {}), ...common(tag, ['key', 'format', 'empty']) };
    }
    case 'e9-roll': {
      const check = tag.attrs.check as Check;
      if (!CHECKS.includes(check)) throw new LayoutError(`line ${tag.line}: check is one of ${CHECKS.join(', ')}`);
      return { t: 'roll', check, key: key(tag, 'key'), ...(tag.attrs.label !== undefined ? { label: tag.attrs.label } : {}), ...(count(tag, 'min') !== undefined ? { min: count(tag, 'min') } : {}), children, ...common(tag, ['check', 'key', 'label', 'min']) };
    }
    case 'e9-action': {
      const act = tag.attrs.do as Action;
      if (!ACTIONS.includes(act)) throw new LayoutError(`line ${tag.line}: do is one of ${ACTIONS.join(', ')}`);
      const k = key(tag, 'key', false);
      const off = key(tag, 'off', false);
      return { t: 'action', do: act, ...(k ? { key: k } : {}), ...(off ? { off } : {}), children, ...common(tag, ['do', 'key', 'off']) };
    }
    case 'e9-each': {
      const as = tag.attrs.as ?? '';
      if (!/^[a-z]\w*$/.test(as) || ['stats', 'gear', 'knowledge', 'flavor', 'd', 'frame'].includes(as)) throw new LayoutError(`line ${tag.line}: as="${as}" should be a short new name`);
      const more = tag.attrs.more;
      return {
        t: 'each', list: key(tag, 'list'), as, children,
        ...(count(tag, 'max') !== undefined ? { max: count(tag, 'max') } : {}),
        ...(count(tag, 'min') !== undefined ? { min: count(tag, 'min') } : {}),
        ...(more !== undefined ? { more } : {}),
        ...common(tag, ['list', 'as', 'max', 'min', 'more'])
      };
    }
    case 'e9-if':
      return { t: 'if', key: key(tag, 'key'), not: 'not' in tag.attrs, children, ...common(tag, ['key', 'not']) };
    case 'e9-portrait':
      return { t: 'portrait', ...common(tag, []) };
    case 'e9-page-ref': {
      const ref = tag.attrs.ref ?? '';
      if (!KEY.test(ref) && !/^[\w:-]+$/.test(ref)) throw new LayoutError(`line ${tag.line}: ref="${ref}" isn't a page reference`);
      return { t: 'ref', ref, children, ...common(tag, ['ref']) };
    }
  }
  throw new LayoutError(`line ${tag.line}: <${n}> isn't allowed in a layout`);
}

// Reads a layout file into nodes, or throws a LayoutError naming the line.
export function parseLayout(src: string): LNode[] {
  const root: LNode[] = [];
  const stack: { tag: Tag; children: LNode[] }[] = [];
  const out = () => (stack.length ? stack[stack.length - 1].children : root);
  for (const tk of tokens(src)) {
    if ('text' in tk) {
      // Whitespace between tags is layout noise; runs of it inside text become one space.
      // As in HTML (and Svelte), whitespace between two siblings is one space; at either end of
      // an element it goes.
      const text = tk.text.replace(/[ \t\r\n]+/g, ' ');
      if (text.trim()) out().push({ t: 'text', text: out().length ? text : text.trimStart() });
      else if (out().length) out().push({ t: 'text', text: ' ' });
      continue;
    }
    if (tk.close) {
      // <e9-portrait></e9-portrait> and <br></br> close themselves already.
      if (VOID.has(tk.name)) continue;
      const top = stack.pop();
      if (!top || top.tag.name !== tk.name) throw new LayoutError(`line ${tk.line}: </${tk.name}> doesn't close ${top ? `<${top.tag.name}> from line ${top.tag.line}` : 'anything'}`);
      out().push(node(top.tag, trimEnd(top.children)));
      continue;
    }
    if (VOID.has(tk.name) || tk.selfClose) {
      out().push(node(tk, []));
      continue;
    }
    stack.push({ tag: tk, children: [] });
  }
  if (stack.length) throw new LayoutError(`line ${stack[stack.length - 1].tag.line}: <${stack[stack.length - 1].tag.name}> is never closed`);
  return trimEnd(root);
}

function trimEnd(list: LNode[]): LNode[] {
  while (list.length) {
    const last = list[list.length - 1];
    if (last.t !== 'text') break;
    const text = last.text.trimEnd();
    if (text) {
      list[list.length - 1] = { t: 'text', text };
      break;
    }
    list.pop();
  }
  return list;
}

// Every value name a layout uses, with the names an e9-each brings into scope, for the load check.
export function keysIn(nodes: LNode[], local: Set<string> = new Set()): { key: string; local: boolean }[] {
  const out: { key: string; local: boolean }[] = [];
  const add = (k: string) => out.push({ key: k, local: local.has(k.split('.')[0]) });
  for (const n of nodes) {
    if (n.t === 'text') continue;
    if (n.t !== 'el' && n.t !== 'portrait' && n.t !== 'ref') {
      if (n.t === 'each') add(n.list);
      else if ('key' in n && n.key) add(n.key);
      if (n.t === 'action' && n.off) add(n.off);
    }
    for (const w of n.when) add(w.key);
    if ('children' in n) out.push(...keysIn(n.children, n.t === 'each' ? new Set([...local, n.as]) : local));
  }
  return out;
}
