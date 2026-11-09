import { describe, expect, it } from 'vitest';
import { addMail, answer, joinRequest, mailFileName, readMailFile, sendBack } from './mail';

const NOW = new Date('2026-11-09T14:00:00Z');

describe('requests between player and referee', () => {
  it('sends a character to join, and the referee sends it back with a note', () => {
    const join = joinRequest('kells-1422', { id: 'holly' }, { id: 'holly', flavor: { name: 'Holly' } }, 'Ann', NOW);
    expect(join).toMatchObject({ campaign: 'kells-1422', kind: 'join', to: 'referee', from: { role: 'player', character: 'holly', name: 'Ann' } });
    expect(mailFileName(join, 'Holly Ó Briain')).toBe('kells-1422-join-holly-briain.json');
    const back = sendBack(join, 'Pick a second language', NOW);
    expect(back).toMatchObject({ kind: 'sent-back', to: 'holly', re: join.id, body: { note: 'Pick a second language' } });
    expect(readMailFile([join, back]).map((e) => e.kind)).toEqual(['join', 'sent-back']);
  });

  it('keeps each message once, and records the answer', () => {
    const join = joinRequest('k', { id: 'a' }, {}, '', NOW);
    let list = addMail([], { envelope: join, box: 'in' });
    expect(addMail(list, { envelope: join, box: 'in' })).toBe(list);
    list = answer(list, join.id, { kind: 'approved', at: NOW.toISOString() });
    expect(list[0].answer?.kind).toBe('approved');
  });
});
