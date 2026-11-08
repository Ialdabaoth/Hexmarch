// Campaign art: the pictures characters use as portraits, kept as one file so they can
// travel with a campaign. A campaign's repository holds it as art.json beside the
// campaign file (or wherever the campaign file's "art" link says); every player's app
// fills in portraits it's missing from there. The same file saves and loads by hand.

export const ART_FORMAT = 'materia-mundi-art';

export interface ArtFile {
  format: typeof ART_FORMAT;
  version: 1;
  // Picture id (as in a sheet's "cache:<id>" portrait) to the picture as a data URL.
  pictures: Record<string, string>;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const PICTURE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function makeArt(pictures: Record<string, string>): ArtFile {
  return { format: ART_FORMAT, version: 1, pictures: { ...pictures } };
}

// The pictures a file holds, leaving out any entry that isn't a picture.
// Throws with a message for the reader when it isn't an art file at all.
export function readArt(data: unknown): Record<string, string> {
  const a = data as Partial<ArtFile> | null;
  if (!a || typeof a !== 'object' || a.format !== ART_FORMAT) throw new Error("That isn't a Materia Mundi art file.");
  if (!a.pictures || typeof a.pictures !== 'object') throw new Error('The art file has no pictures.');
  const out: Record<string, string> = {};
  for (const [id, pic] of Object.entries(a.pictures)) {
    if (ID.test(id) && typeof pic === 'string' && PICTURE.test(pic)) out[id] = pic;
  }
  return out;
}

// Where a campaign's art file sits: its "art" link, else art.json beside the campaign file.
export function artUrl(campaignUrl: string, link?: string): string {
  return new URL(link || 'art.json', campaignUrl).href;
}

// Pictures from `found` that `wanted` ids need and `have` lacks.
export function missingFrom(found: Record<string, string>, wanted: Iterable<string>, have: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of wanted) if (!have[id] && found[id]) out[id] = found[id];
  return out;
}
