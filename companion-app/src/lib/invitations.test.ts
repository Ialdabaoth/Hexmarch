import { describe, expect, it } from 'vitest';
import { addInvitation, bindCharacter, invitationLabel, inviteLink, knownCreatures, readInvite, withRefereeInvitations } from './invitations';
import { mergeKnowledge, readKnowledge } from './sheet';

const NOW = new Date('2026-11-09T12:00:00Z');

describe('invitation links', () => {
  it('reads a player invitation with its character, and a plain campaign link as the referee', () => {
    expect(readInvite('?campaign=https://x.test/c.json&as=player&character=aoife')).toEqual({ url: 'https://x.test/c.json', role: 'player', character: 'aoife' });
    expect(readInvite('?campaign=scribe:kells-1422')).toEqual({ url: 'scribe:kells-1422', role: 'referee' });
    expect(readInvite('?campaign=https://x.test/c.json&character=aoife')).toEqual({ url: 'https://x.test/c.json', role: 'referee' });
    expect(readInvite('?module=b2')).toBeNull();
  });

  it('writes a link that reads back the same', () => {
    const i = { url: 'https://x.test/c.json', role: 'player' as const, character: 'aoife' };
    expect(readInvite(new URL(inviteLink('https://app.test/', i)).search)).toEqual(i);
  });
});

describe('invitations on the device', () => {
  it('keeps one per invitation: the same campaign as referee and as two players', () => {
    let list = addInvitation([], { url: 'c', role: 'referee' }, NOW).invitations;
    list = addInvitation(list, { url: 'c', role: 'player', character: 'a' }, NOW).invitations;
    list = addInvitation(list, { url: 'c', role: 'player', character: 'b' }, NOW).invitations;
    expect(list.map((s) => `${s.role}:${s.character ?? ''}`)).toEqual(['referee:', 'player:a', 'player:b']);
    const again = addInvitation(list, { url: 'c', role: 'player', character: 'a' }, NOW);
    expect(again.invitations).toBe(list);
    expect(again.invitation).toBe(list[1]);
  });

  it('turns campaigns opened before invitations into referee invitations', () => {
    const player = addInvitation([], { url: 'b', role: 'player' }, NOW).invitations;
    const list = withRefereeInvitations(player, ['a', 'b'], NOW);
    expect(list.map((s) => `${s.url}:${s.role}`)).toEqual(['b:player', 'a:referee']);
  });

  it('binds a character to a player invitation and labels it', () => {
    const { invitations, invitation } = addInvitation([], { url: 'c', role: 'player' }, NOW);
    const bound = bindCharacter(invitations, invitation.id, 'aoife');
    expect(bound[0].character).toBe('aoife');
    expect(invitationLabel(bound[0], 'Kells', 'Aoife')).toBe('Kells · playing Aoife');
    expect(invitationLabel({ ...bound[0], role: 'referee' }, 'Kells')).toBe('Kells · referee');
  });
});

describe('creatures a character knows', () => {
  it('keeps creature entries, and a meeting outranks hearsay', () => {
    let k = readKnowledge([{ creature: 'abbot', name: 'the abbot', rumour: true, how: 'tavern talk' }, { creature: '', name: 'x' }]);
    expect(k).toEqual([{ creature: 'abbot', name: 'the abbot', rumour: true, how: 'tavern talk' }]);
    k = mergeKnowledge(k, [{ creature: 'abbot', name: 'Abbot Fintan' }]);
    expect(k).toEqual([{ creature: 'abbot', name: 'Abbot Fintan', how: 'tavern talk' }]);
    // hearing of them again changes nothing once met
    expect(mergeKnowledge(k, [{ creature: 'abbot', name: 'the abbot', rumour: true }])).toEqual(k);
  });

  it('lists each creature once, met before heard of', () => {
    const list = knownCreatures([
      { creature: 'wolf', name: 'the grey wolf', rumour: true },
      { creature: 'abbot', name: 'Abbot Fintan', how: 'at the priory' },
      { hex: 'world:0101:0101' },
      { creature: 'wolf', name: 'the grey wolf', rumour: true }
    ]);
    expect(list).toEqual([
      { id: 'abbot', name: 'Abbot Fintan', met: true, how: 'at the priory' },
      { id: 'wolf', name: 'the grey wolf', met: false }
    ]);
  });
});
