// Requests between a player's Companion and the referee's (data repo modules/WORKFLOWS.md "Invitations" and
// "One envelope"). Every message sent or received is kept on the device under "mail", with where it stands.
// Delivery: a campaign with a post URL gets one POST; without one (the Manual adapter) the sender saves a file
// and passes it on however they like, and the other side opens it in the Inbox.

import { get, set } from 'idb-keyval';
import { envelope, readEnvelope, type Envelope } from '../../../engine/mail';
import { isWebhookUrl, postMail } from './discord';

export interface MailItem {
  envelope: Envelope;
  // 'in': received here; 'out': sent from here.
  box: 'in' | 'out';
  // The referee's answer to a request: approved (in the next publish) or sent back with a note.
  answer?: { kind: 'approved' | 'sent-back'; note?: string; at: string };
  // Sent to a Discord channel: the post's id, and the status its text last showed (the witness post).
  discord?: { id: string; shows?: string };
}

export async function loadMail(): Promise<MailItem[]> {
  const raw = (await get<MailItem[]>('mail')) ?? [];
  return raw.filter((m) => m && (m.box === 'in' || m.box === 'out') && m.envelope && typeof m.envelope.id === 'string');
}

export async function saveMail(list: MailItem[]) {
  await set('mail', JSON.parse(JSON.stringify(list)));
}

// Adds a message once; the same id again changes nothing.
export function addMail(list: MailItem[], item: MailItem): MailItem[] {
  return list.some((m) => m.envelope.id === item.envelope.id && m.box === item.box) ? list : [...list, item];
}

export function answer(list: MailItem[], id: string, a: MailItem['answer']): MailItem[] {
  return list.map((m) => (m.envelope.id === id ? { ...m, answer: a } : m));
}

// A player's join request: the seat's character, every part of it, plus the player's name for the referee.
// party: the party the player's invitation is to, so the referee's Approve puts the character in it.
export function joinRequest(campaign: string, character: { id: string }, sheet: object, name: string, party?: string, now = new Date()): Envelope {
  return envelope({ campaign, kind: 'join', from: { role: 'player', character: character.id, ...(name ? { name } : {}) }, to: 'referee', body: { character: sheet, ...(party ? { party } : {}) } }, now);
}

export function sendBack(request: Envelope, note: string, now = new Date()): Envelope {
  return envelope({ campaign: request.campaign, kind: 'sent-back', from: { role: 'referee' }, to: request.from.character ?? '', re: request.id, body: { note } }, now);
}

// What a file holds: one message, or a list of them.
export function readMailFile(d: unknown): Envelope[] {
  return (Array.isArray(d) ? d : [d]).map(readEnvelope);
}

export const mailFileName = (e: Envelope, who: string) =>
  `${e.campaign}-${e.kind}-${(who || 'request').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'request'}.json`;

// One POST to the campaign's post URL. text/plain keeps the browser from asking the host first (no CORS
// preflight), which an Apps Script web app can't answer. Throws when it can't be sent.
// A Discord webhook as the post URL posts a readable line with the envelope attached; returns that post's id.
export async function post(url: string, e: Envelope, line = '', name = ''): Promise<string | undefined> {
  if (isWebhookUrl(url)) return postMail(url, { name: mailFileName(e, name), data: e }, line || `A ${e.kind} message for the referee`);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(e) });
  if (!res.ok) throw new Error(`The referee's mailbox answered ${res.status}`);
  return undefined;
}

// The text of a join request's post in the channel, for each status it can reach (Sent, Received, Approved, Sent back).
export function joinLine(player: string, character: string, status: 'sent' | 'received' | 'live' | 'sent-back'): string {
  const who = `${player || 'A player'} asks to join with ${character || 'a character'}`;
  return status === 'live' ? `✅ ${player || 'A player'} joined with ${character || 'a character'}` : status === 'sent-back' ? `↩️ ${who}: sent back with a note` : `⏳ ${who} (waiting for the referee)`;
}
