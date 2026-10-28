# Equipment files

Agreed with Heph 2026-10-28 and built in steps from 0.2.1 to 0.2.5 (see **Build
order** at the end). As of 0.2.4 the equipment files hold the Compendium's armor,
weapons, gear and magic, sheets reference them, and magic items are items with a
dweomer; dweomer `effects` and campaigns are still to come.

## The idea in one paragraph

An **equipment file** is a catalog of everything a character can own or know: armor,
weapons, adventuring gear, and magic (spells, miracles, glamours and dweomers). A
character sheet no longer copies an item's stats. It holds a **reference** into a
catalog, such as `mm:longsword`, plus whatever is unique to that one object (its name,
a masterwork bonus, its enchantment). A **magic item is an ordinary item with a dweomer
in its `enchantment` field**: a Mirror Shield is `mm:shield` enchanted with
`mm:mirror-shield`. A referee can publish a **campaign** at a URL that names the rules and equipment
files for their game, including their own custom items, spells and dweomers. Players
point their app at that URL. Without one, the app uses a campaign on the device with
an editable custom file.

## Files

| File id | What it is | Editable in the app |
| ------- | ---------- | ------------------- |
| `mm`    | Materia Mundi Compendium, first edition (default for `mm`) | No |
| `e9`    | E9 System Reference Handbook (`e9` and `e9mm` use `e9` then `mm`) | No |
| `local` | This device's custom equipment | Yes |
| any id  | A custom file named by a campaign URL (see Campaigns) | No, the referee republishes it |

Published files live in `src/equipment/` (`mm-equipment.json`, `e9-equipment.json`).
The weapon and armor catalogs move out of the ruleset files' `gear` block into these.
The rulesets keep the *mechanics* (what light, medium and heavy mean, two-weapon
rules, wizard armor limits); the equipment files hold the *things*.

A ruleset can name several files in priority order (`"equipment": ["e9", "mm"]`):
armor and weapons come from the first, and other gear and magic from all of them, the
first file winning when two have the same name. E9 and E9 for Materia Mundi both do
this: E9 is a rules interface on top of an existing OSR game and has no spell list of
its own, so its wizards and priests use the Compendium's spells and miracles for now
(a B/X-inspired E9 list is planned), and E9 for Materia Mundi's dweomersmiths and
druids get the Compendium's dweomers and glamours.

A revised edition gets a new file id (say `mm2`), never an edit to `mm`, so old
references keep meaning what they meant. Fixing a typo or a wrong page number in
place is fine.

### File shape

```json
{
  "format": "materia-mundi-equipment",
  "version": 1,
  "id": "mm",
  "name": "Materia Mundi Compendium (1st ed.)",
  "rules": ["mm", "e9mm"],
  "currency": "sp",
  "items": [ ... ],
  "magic": [ ... ]
}
```

- `rules`: the rulesets this file is meant for. The picker offers these first but
  doesn't forbid others.
- `currency`: the unit for `cost` (silver pieces in the Compendium, p. 45).

## References

A reference is `<file id>:<entry id>`, e.g. `mm:longsword`, `mm:fireball`,
`local:grandmothers-dagger`. Entry ids are lower-case kebab-case names and are unique
within a file across both `items` and `magic`.

If a reference can't be found (the file isn't installed, or a local entry was
deleted), the app still shows the object under its saved `name`, marked "not in your
equipment", and keeps the reference so nothing is lost.

## Items

Every item has:

| Field | Meaning |
| ----- | ------- |
| `id`, `name` | |
| `kind` | `armor`, `weapon`, `gear`, `mount` or `service` |
| `cost` | Price in the file's currency (common quality, off the shelf) |
| `encumbrance` | Encumbrance points (default 0) |
| `page` | Page in the book, if any |
| `summary` | One or two lines for the sheet and the picker |
| `properties` | Tags such as `Simple`, `Parry`, `Piercing`, `Steel` |

Then by kind:

- **armor**: `armorType` (`light`, `medium`, `heavy`), `defense`.
- **weapon** (shields included): `size`, `reach`, `thrown` or `range`, `ranged`,
  `shield`. Same meaning as today's sheet fields.
- **gear**: optional `stack` (e.g. `"quiver of 20"`) for things counted by quantity,
  and `slots` for containers (a potion belt holds 6).
- **mount**, **service**: just cost and summary for now; they're there so a referee's
  shop list and the Compendium price table (p. 46) fit in one place.

```json
{ "id": "longsword", "name": "Longsword", "kind": "weapon", "size": "medium",
  "cost": 25, "properties": ["Parry"], "page": 48 },
{ "id": "heavy-armor", "name": "Heavy armor", "kind": "armor", "armorType": "heavy",
  "defense": 3, "encumbrance": 3, "cost": 500, "properties": ["Steel", "Hardened"], "page": 47 },
{ "id": "potion-belt", "name": "Potion belt", "kind": "gear", "slots": 6, "page": 51,
  "summary": "Six padded pockets; draw an item as a single action." }
```

## Magic

Spells, miracles, glamours and dweomers are all entries in `magic`, told apart by
`system`. Each magic-using class names its system in the ruleset (`"magic": { "system":
"arcane", ... }`), which picks what its book offers:

| `system`  | Book calls it | Strength measured by |
| --------- | ------------- | -------------------- |
| `arcane`  | Spell (wizard) | `circle` 1–5 |
| `divine`  | Miracle (priest) | `circle` 1–5 |
| `primal`  | Glamour (druid, bard) | `circle` 1–5 |
| `dweomer` | Magic item blueprint or alchemical formula (dweomersmith, and crafted by wizards and druids) | `rarity` |

Common fields: `id`, `name`, `system`, `page`, `summary`, and optional `tags`
(schools, domains, glamour families: `["Flame", "Conjuration"]`).

- **arcane** adds `cantrip` (`"Magic Missile (Fire)"`).
- **dweomer** adds:
  - `rarity`: `common`, `uncommon`, `rare` or `legendary`; or `rarities`, a list,
    for the book's "Any Rarity" and "Common+" items.
  - `origins`: `["arcane"]`, `["arcane", "primal"]`, `["divine"]`, ...
  - `form`: where it goes, from the Compendium's item types (p. 63): `weapon`,
    `armor`, `shield`, `amulet`, `belt`, `boots`, `crown`, `ring`, `wondrous`, plus
    `potion` for alchemical formulae.
  - `base`: optional reference to the item it's normally built on
    (`"mm:shield"` for a Mirror Shield), so "add magic item" can fill in both halves.
  - `ingredients`: list of strings.
  - `effects`: optional numbers the app can use directly, e.g.
    `{ "attack": 1, "damagePerRarity": "1d6", "defense": 2, "encumbrance": 1 }`.
    Anything not captured here stays in `summary` for the player to read.

```json
{ "id": "fireball", "name": "Fireball", "system": "arcane", "circle": 3,
  "tags": ["Flame", "Conjuration"], "cantrip": "Magic Missile (Fire)", "page": 107,
  "summary": "4-pace blast within 20 paces, 1d6 fire per caster level; 6s ignite." },
{ "id": "mirror-shield", "name": "Mirror Shield", "system": "dweomer", "rarity": "rare",
  "origins": ["arcane"], "form": "shield", "base": "mm:shield",
  "ingredients": ["feysilver", "Aether Pearl"], "page": 66,
  "summary": "Finesse check to block any attack; reflect a blocked magic attack once per sunrise or sunset." }
```

Summaries plus page numbers keep the files small (Heph's call for now; in 0.4.0 page
numbers become links into a rules wiki, as an optional `wiki` URL on each entry) and send players to the book for the
full text. A `text` field for the full entry is allowed (useful for local custom
spells, which have no book to point at).

## On the character sheet (format version 3)

Each owned object keeps its own `id` (so `worn` and `wielded` still work) and gains
`ref`. `name` stays: it's what the player would write on paper, and the fallback if
the reference goes missing.

```json
"campaign": "device",
"inventory": {
  "armor": [{ "id": "a1", "ref": "mm:light-armor", "name": "Light armor" }],
  "weapons": [
    { "id": "w2", "ref": "mm:dagger", "name": "Dagger" },
    { "id": "w3", "ref": "mm:dagger", "name": "Grandmother's dagger", "bonus": 1,
      "enchantment": { "ref": "mm:earthbreaker", "rarity": "uncommon", "charges": 3 } }
  ],
  "worn": "a1",
  "wielded": ["w3", "w2"],
  "items": [{ "id": "i1", "ref": "mm:dungeoneers-kit", "name": "Dungeoneer's kit", "qty": 1 }],
  "book": [{ "ref": "mm:fireball", "magic": "Fireball" }],
  "prepared": [{ "ref": "mm:fireball", "magic": "Fireball", "spent": false }]
}
```

- `campaign` at the top of the sheet: the campaign URL the character was made for, or
  `"device"`. The pickers offer the active campaign's equipment files.
- Per-object fields (only what differs from the catalog): `name`, `bonus`
  (masterwork), `qty`, `notes`, and `enchantment`.
- `enchantment` is the dweomer: `{ "ref", "rarity", "charges", "quality", "cursed" }`.
  `rarity` is needed only when the dweomer allows several. `quality` is `good`, `fair`
  or `poor` for arcane items (p. 64). A bare string `"mm:earthbreaker"` is accepted
  as shorthand.
- Magic in `book` and `prepared` is a `ref` plus its name in `magic`; its circle or
  rarity comes from the catalog, and `circle` is saved only for a dweomer that can be
  made at several rarities (1 common to 4 legendary). A dweomersmith's prepared enchantment can name the object it's on with
  `"item": "w3"`.
- Hand-written sheets can still put a plain name anywhere a reference goes
  (`"items": ["Rope"]`); the app matches it against the character's files and keeps
  it as free text if nothing matches.

**Migration from version 2.** Weapon and armor `type` becomes a `ref` by matching
the old catalog name. Item strings become objects, matched by name where possible.
Free-text `enchantment` becomes a `ref` when it matches a dweomer name, otherwise it
moves to `notes`. Book and preparation names become refs the same way. Nothing is
dropped.

## Campaigns: rules and equipment from a URL

A referee decides which rules and equipment their game uses and publishes that as a
**campaign file** at a URL. Players paste the URL into Settings (or open a share
link), and their app uses that campaign. With no URL set, the app uses
**This device**, a campaign that lives only on the phone.

```json
{
  "format": "materia-mundi-campaign",
  "version": 1,
  "id": "hansa",
  "name": "The Hansa Campaign",
  "referee": "Brent",
  "rules": "mm",
  "equipment": ["mm", "https://example.com/hansa/custom-equipment.json"]
}
```

- `rules`: a built-in ruleset id, or a URL to a ruleset JSON in the same format as
  `src/rules/options/*.json`. A custom ruleset needs its own `id` (say `hansa-rules`).
- `equipment`: published file ids and/or URLs, in priority order. A custom file at a
  URL has its own `id` too, and references into it use that id
  (`hansa:teutonic-blade`).
- The app downloads the campaign and everything it names, keeps a copy for offline
  play, and checks for updates when it's online. The host has to allow
  cross-site reads (CORS). GitHub Pages, raw GitHub files and gists do; Google Drive
  share links don't. Settings will say so when a URL can't be read.
- A campaign from a URL is read-only in the app. The referee edits their own copy
  and republishes it.

**This device** is the default campaign. You pick its ruleset and published
equipment, and it has an editable equipment file with the id `local`. The editor
lives in Settings under **Custom equipment**: a list grouped by kind and system, a
form for each kind, and a raw JSON view. **Publish as campaign** exports the
campaign file plus the custom equipment file, so a referee can build their game on
their own phone, upload the two files somewhere, and share the link.

### Characters and campaigns

A character sheet records `"campaign"`: the campaign's URL, or `"device"`. Its
`rules` and its references say what it needs. A character is **compatible** with
the active campaign when the campaign provides its ruleset and every file it
references. Incompatible characters still show and still open, but greyed out on
the home screen and character list, with a note saying which campaign they belong
to.

- **Exporting a character bundles any custom entries it uses** (from `local` or a
  campaign URL file) under a `custom` key, so it still opens on a device that
  doesn't have that file. On import, entries from `local` are offered for the
  device's own custom file; entries from a URL file are used only as a fallback
  until that campaign is loaded.
- "Referee-approved" means "in the campaign the referee published". The app has no
  accounts, so it trusts whatever the files say. Entries may carry an optional
  `source` note (e.g. `"Approved by Brent, session 4"`).

## Build order (0.2.x)

1. **0.2.1** Equipment file format and loader, `mm-equipment.json` and
   `e9-equipment.json` for weapons, armor, gear and prices; rulesets stop carrying
   catalogs. No sheet change yet.
2. **0.2.2** Sheet version 3: references for armor, weapons and items, the migration,
   and the equipment pickers. (Choosing a file per character waits for campaigns.)
3. **0.2.3** Magic catalog: Compendium spells, miracles, glamours and dweomers
   entered from the book; `book` and `prepared` become references.
4. **0.2.4** Magic items: the enchantment picker (item + dweomer), rarity, charges,
   quality and curses on the sheet. (`effects` feeding attack, damage and defense
   waits until entries carry them; for now the bonus field is set by hand.)
5. **0.2.5** Campaigns: campaign files and URLs for rules and equipment, offline
   caching, greyed-out incompatible characters, the custom equipment editor,
   "Publish as campaign", and bundling custom entries with character export.

## Decisions (Heph, 2026-10-28)

- Sheets hold references, not copies.
- Spells, miracles, glamours and dweomers are equipment; a magic item is an item plus
  a dweomer in its `enchantment` field.
- Rules and equipment can come from a campaign URL; the default is a campaign on the
  device with one editable custom file.
- Summaries plus page numbers, not full text. In 0.4.0 page numbers become links into
  a rules wiki.
- Golem armor waits for the referee section in 0.3.0, as a pilotable huge creature
  rather than equipment.
