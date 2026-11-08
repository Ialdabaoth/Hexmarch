import { describe, expect, it } from 'vitest';
import { ABILITIES, RULESETS, TALENTS, rulesFor } from './rules';

// Guards hand edits to the files in options/.
const abilityIds = new Set<string>(ABILITIES.map((a) => a.id));
const talentIds = new Set<string>(TALENTS.map((t) => t.id));

describe.each(RULESETS.map((r) => [`${r.id}-options.json`, r] as const))('%s', (_, rules) => {
  const classIds = new Set(rules.classes.map((c) => c.id));
  const originIds = new Set(rules.origins.map((o) => o.id));

  it('has mechanics', () => {
    expect(['all', 'fighters']).toContain(rules.mechanics.attackProgression);
    expect(rules.mechanics.throwMin).toBeGreaterThanOrEqual(2);
  });

  it('origins point at real classes and abilities', () => {
    for (const o of rules.origins) {
      // A combined class like "fighter+dweomersmith" needs every part to exist.
      for (const c of o.classes) for (const part of c.split('+')) expect(classIds, `${o.id} -> ${part}`).toContain(part);
      for (const a of [...o.enhanced, ...o.deficient]) expect(abilityIds, `${o.id} -> ${a}`).toContain(a);
    }
  });

  it('classes are complete', () => {
    for (const c of rules.classes) {
      expect(['fighter', 'expert', 'magic-user']).toContain(c.kind);
      expect(abilityIds).toContain(c.prime);
      for (const t of [...(c.trainable ?? []), ...(c.expertise ?? []), ...Object.values(c.trainingSchedule ?? {})]) {
        expect(talentIds, `${c.id} -> ${t}`).toContain(t);
      }
      expect(rules.origins.some((o) => o.classes.some((x) => x.split('+').includes(c.id))), `${c.id} has an origin`).toBe(true);
    }
  });

  it('origin tables cover every roll and lead somewhere real', () => {
    const { start, tables } = rules.originRoll;
    expect(tables).toHaveProperty(start);
    for (const [name, t] of Object.entries(tables)) {
      const sides = Number(t.die.replace(/^d/, ''));
      for (let n = 1; n <= sides; n++) {
        const hits = t.results.filter((r) => n >= r.min && n <= r.max);
        expect(hits, `${name} roll ${n}`).toHaveLength(1);
        const r = hits[0];
        if (r.origin) expect(originIds).toContain(r.origin);
        else expect(tables, `${name} -> ${r.table}`).toHaveProperty(r.table!);
      }
    }
  });

  it('quick NPC table, if any, uses real origins and classes', () => {
    for (const r of rules.options.quickNpc?.results ?? []) {
      expect(originIds).toContain(r.origin);
      expect(rules.getOrigin(r.origin).classes, `${r.origin} ${r.class}`).toContain(r.class);
    }
  });
});

describe('older sheets', () => {
  it('reads the old "1e" rules id as Materia Mundi', () => {
    expect(rulesFor('1e').id).toBe('mm');
  });
});
