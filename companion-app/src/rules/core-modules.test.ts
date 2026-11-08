import { describe, expect, it } from 'vitest';
import { CORE_RULES, coreRulesFrom } from './core-modules';

describe('core rules modules', () => {
  it('finds E9 in its module', () => {
    expect(CORE_RULES.e9).toMatchObject({ ruleset: 'e9', module: 'e9-core', option: '' });
    expect(CORE_RULES.e9.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('reads options inside a module', () => {
    const got = coreRulesFrom([
      { format: 'e9-rules/1', id: 'mm-core', title: 'Materia Mundi', version: '0.1.0', ruleset: 'mm', options: [{ id: 'e9', title: 'Materia Mundi for E9', ruleset: 'e9mm' }] },
      { format: 'mm-module/1', id: 'isle-of-mists', version: '1.0.0', ruleset: 'x' }
    ]);
    expect(got).toEqual({
      mm: { ruleset: 'mm', module: 'mm-core', option: '', title: 'Materia Mundi', version: '0.1.0' },
      e9mm: { ruleset: 'e9mm', module: 'mm-core', option: 'e9', title: 'Materia Mundi for E9', version: '0.1.0' }
    });
  });
});
