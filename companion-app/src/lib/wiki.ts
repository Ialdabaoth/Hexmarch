// Links from the app's rules entries into the SRD wiki. The wiki is edited by hand
// and is the source of truth; src/rules/wiki-links.json maps app references to its
// pages and headings. Check it with scripts/check-wiki-links.py after big wiki edits.
import links from '../rules/wiki-links.json';

export const WIKI_BASE = 'https://github.com/Ialdabaoth/MateriaMundiRPG/wiki/';

const LINKS = links as Record<string, string>;

function url(key: string): string | null {
  const target = LINKS[key];
  return target ? WIKI_BASE + target : null;
}

// Equipment and magic, by reference ("mm:dagger", "mm:fireball").
export const wikiForEntry = (ref: string) => url(ref);

// A class in a ruleset ("mm", "warrior").
export const wikiForClass = (rules: string, classId: string) => url(`${rules}:class:${classId}`);

// A creature, by bestiary reference ("mm:giant-rat").
export function wikiForMonster(ref: string): string | null {
  const i = ref.indexOf(':');
  return i < 0 ? null : url(`${ref.slice(0, i)}:bestiary:${ref.slice(i + 1)}`);
}

// The wiki page an entry sits on, without its heading ("Armor-and-Shields").
export function wikiPageOf(ref: string): string | null {
  const u = url(ref);
  return u ? u.split('#')[0] : null;
}

// A table or section of the Compendium with no app reference of its own.
export const wikiPage = (page: string) => WIKI_BASE + page;

// A cantrip by name; variants like "Magic Missile (Fire)" share their cantrip's entry.
export function wikiForCantrip(name: string): string {
  const base = name.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase().replace(/\s+/g, '-');
  return url(`mm:cantrip:${base}`) ?? WIKI_BASE + 'Arcane-Spells#cantrips';
}
