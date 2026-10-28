// Bestiary files: animals, monsters and fair folk with their printed stat blocks and the
// page they're on. Beast companions and the referee's browser both read them. Sheets
// point into them with references like "mm:giant-rat", as they do for equipment.

import { roll, type Rng } from '../lib/dice';
import mmBestiary from './mm-bestiary.json';

export type SaveKind = 'doom' | 'hold' | 'blast' | 'trick' | 'curse' | 'fear';
export type MonsterKind = 'animal' | 'fey beast' | 'monster' | 'fair folk' | 'dragon' | 'undead' | 'infernal' | 'qlippothic' | 'huge' | 'mortal';

export interface Monster {
  id: string;
  name: string;
  kind: MonsterKind;
  page?: number;
  // Hit dice as the book prints them: a number, or [min, max] for a range.
  level?: number | [number, number];
  size: string;
  movement: string;
  armor: string;
  // Hit points as printed, e.g. "(3d6+6)x2" or "per hd".
  hp: string;
  attacks: string;
  // Saving throw targets ("Doom 15+" is 15); missing where the book gives none.
  saves?: Partial<Record<SaveKind, number>>;
  // Ability adjustments, as text, for the undead and mortal races.
  abilities?: string;
  feat?: string;
  summary: string;
}

export interface BestiaryFile {
  format: 'materia-mundi-bestiary';
  version: number;
  id: string;
  name: string;
  // Rulesets this file is meant for.
  rules: string[];
  monsters: Monster[];
}

export type WithRef<T> = T & { ref: string };

export class Bestiary {
  private byRef = new Map<string, WithRef<Monster>>();

  constructor(readonly files: BestiaryFile[]) {
    for (const f of files) {
      for (const m of f.monsters) {
        const ref = `${f.id}:${m.id}`;
        // The first file wins on a reference, as in the equipment files.
        if (!this.byRef.has(ref)) this.byRef.set(ref, { ...m, ref });
      }
    }
  }

  get(ref: string): WithRef<Monster> | undefined {
    return this.byRef.get(ref);
  }

  list(): WithRef<Monster>[] {
    return [...this.byRef.values()];
  }

  // Animals and fey beasts with a fixed level: the ones a druid or hunter can keep.
  companions(): WithRef<Monster>[] {
    return this.list().filter((m) => (m.kind === 'animal' || m.kind === 'fey beast') && typeof m.level === 'number');
  }
}

export const BESTIARY = new Bestiary([mmBestiary as BestiaryFile]);

// The level as one number: a range counts from its low end.
export function levelOf(m: Monster): number | undefined {
  if (typeof m.level === 'number') return m.level;
  return m.level?.[0];
}

// The hit points a monster rolls from its printed formula: "(3d6+6)x2", "7d6÷2", "4d6+8",
// "6d6 + 5 SP". Structure points ("SP") are not hit points, so they're left out.
export function rollHp(formula: string, rng: Rng = Math.random): number {
  const f = formula.replace(/[[\]]/g, '').replace(/\s*\+?\s*\d+\s*SP\s*$/, '').replace(/\s+/g, '').trim();
  const m = f.match(/^\(?([^()x÷]+)\)?(?:x(\d+)|÷(\d+))?$/);
  if (!m) return 1;
  let total = roll(m[1], rng).total;
  if (m[2]) total *= Number(m[2]);
  if (m[3]) total = Math.floor(total / Number(m[3]));
  return Math.max(1, total);
}
