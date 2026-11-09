# Character sheets

A **character sheet** is the saved JSON. It is a chronicle: how the character was
made and what each level added, plus what a player would write on a paper sheet over
time (XP, inventory, retinue, notes). It never stores anything the rules can work
out, such as max HP, level or thresholds.

A **character** is the live version, computed from the sheet whenever the sheet
loads or changes, with current HP and temporary effects layered on top:

| Live (character)           | Permanent (character.sheet) |
| -------------------------- | --------------------------- |
| `character.hp`, current HP | `character.sheet.hp()`, max HP |
| `character.con`, with boosts and debuffs | `character.sheet.con()`, permanent Con |
| `character.talents.stealth` | `character.sheet.talent('stealth')` |
| `saveThreshold(character, 'str')` | `character.sheet.save('str')` |

Damage taken and temporary effects are kept on the device with the character but
are not part of the exported sheet.

## Four parts

A character is saved and exported in **four parts**, so each can be shared, kept secret or replaced on its own (Heph 2026-11-08):

| Part | Holds |
|---|---|
| `stats` | `origin`, `class` (XP and level-ups), `abilities`, `followers` |
| `gear` | the inventory: armor, weapons, items, what's worn and wielded, spellbook and preparations |
| `knowledge` | what the character knows: dated entries pointing into a module (see below) |
| `flavor` | `name`, `portrait`, `notes` |

Every file starts with the same header (`format`, `version`, `id`, `rules`, and `campaign` and `owner` when set), so any part finds its character by `id`. A file with all four parts is a whole character; in a campaign repository each character can be kept as four files, `campaign/characters/<id>/stats.json`, `gear.json`, `knowledge.json` and `flavor.json`, each holding the header and its one part.

- **Export JSON** on a sheet writes the whole character. Below it, **Export one part only** writes a file with the header and that one part (Stats, Gear, Knowledge, or Name, portrait and notes). A gear file carries the custom equipment it uses.
- **Load a part** on a sheet, or Import on the Party tab, reads any of these files. The parts in the file replace the same parts of the character with that `id`; the parts it leaves out stay as they are. A file without `stats` needs the character to be on the device already.
- **Export all** writes `{ "format": "materia-mundi-characters", "version": 4, "characters": [ ... ] }`, each one a whole character. Import accepts any of these, so sheets can also be written or edited by hand.
- Older files, with every field at the top level (version 3 and before), still import. The device keeps its own copy in that flat layout.

```json
{
  "format": "materia-mundi-character",
  "version": 4,
  "id": "c0ffee00-0000-4000-8000-000000000001",
  "rules": "mm",
  "flavor": {
    "name": "Holly",
    "portrait": "",
    "notes": ""
  },
  "stats": {
    "origin": "human",
    "class": {
      "name": "scout",
      "xp": 1,
      "levelups": [
        { "level": 1, "hp": 5, "stealth": 1 },
        { "level": 2, "hp": 3, "stealth": 1, "feat": "Promised the Abbot a favor" }
      ]
    },
    "abilities": {
      "con": -1,
      "str": 0,
      "dex": { "score": 2, "agility": 1, "finesse": 1 },
      "int": { "score": 0 },
      "wis": { "score": -1, "alertness": -1 },
      "cha": { "score": 1, "wit": 1 }
    },
    "followers": []
  },
  "gear": {
    "armor": [
      { "id": "a1", "ref": "mm:light-armor", "name": "Light armor" }
    ],
    "weapons": [
      { "id": "w1", "ref": "mm:light-crossbow", "name": "Light crossbow" },
      { "id": "w2", "ref": "mm:dagger", "name": "Dagger" },
      { "id": "w3", "ref": "mm:dagger", "name": "Grandmother's dagger", "bonus": 1 }
    ],
    "worn": "a1",
    "wielded": ["w3", "w2"],
    "items": [
      { "id": "i1", "ref": "mm:lockpicking-tools", "name": "Lockpicking tools" },
      { "id": "i2", "ref": "mm:dungeoneers-kit", "name": "Dungeoneer's kit" },
      { "id": "i3", "name": "Lucky coin" }
    ],
    "book": [],
    "prepared": []
  },
  "knowledge": [
    { "session": 3, "module": "isle-of-mists", "place": "crom-cave-g", "how": "scouted alone" },
    { "session": 3, "module": "isle-of-mists", "hex": "world:6950:2611" }
  ]
}
```

## Knowledge

What one character knows is kept on their own sheet, as dated entries, not on the map (modules/WORKFLOWS.md in the data repo, "Knowledge per creature"). Each entry has the `session` it was learned in and the `module` it belongs to, and points at one thing: a 100-ft `hex` address, a `place` slug, a `handout`, or a free-text `note`. `how` says how it was learned. Entries that point at nothing are dropped. What everyone knows stays in the campaign state's `revealed` set (STATE_FORMAT.md).

For the Atlas's fog of war (Atlas 0.5.17, ATLAS_FORMAT.md "Fog of war"), a `hex` entry means the character knows the whole 3-mile hex (League) that holds it: they have seen it or passed through (**visited**). `"explored": true` means it has been searched, which shows its hidden sites. `"rumour": true` means they have only heard of the hex or `place`; seeing it replaces the rumour. When the party moves in the Atlas, each character in the party gets an entry (`"how": "seen"`) for every 3-mile hex in sight along the way, and the referee's fog brush adds or removes entries the same way. The Companion keeps them as they arrive.

## Changes are tallies

Anything that changes a talent or hit points is written as a number keyed by its
name, so a quick scan of the sheet can add them up.

- Every talent starts at 5+. Each `"agility": 1` anywhere in the sheet improves it
  one step and each `"agility": -1` worsens it one step:

      threshold = 5 − (sum of all "agility" entries)

  In the example, `"stealth": 1` appears twice in `levelups`, so Stealth is 3+.
  `"agility": 1` appears once under `abilities.dex`, so Agility is 4+.
- A combined class can train the same talent from two of its classes at one level;
  that level records `"survival": 2`, which counts as two steps.
- Max HP is the sum of the `"hp"` entries in `levelups` (5 + 3 = 8 in the example).
- Level is the number of entries in `levelups`.

Where they appear:

- `abilities.<ability>`: adjustments from that ability at creation, one per point
  above or below +0, for talents linked to that ability.
- `class.levelups[]`: the hit points and the talent training gained at each level,
  in order. `feat` records any other choice made at that level, such as a fighter feat.

When typing a sheet by hand, `"+"`, `"+1"`, `"-"` and `"+3"` are accepted too, and the
level 1 `hp` can be left out (it is the starting HP from the rules).

## Other fields

Field names below are the ones inside each part (`inventory.armor` is `gear.armor` in an exported file).

- `portrait`: a link to an image. Empty for none.
  - `https://...`: a picture on the web, loaded from there each time.
  - `cache:<id>`: a picture uploaded on the device, kept in the app's own portrait
    store so the sheet stays small. The app shrinks pictures to 256×256 JPEG (PNG
    when the picture has see-through areas). The store isn't exported yet, so on
    another device a `cache:` portrait shows as empty.
  - Older files may hold the picture inline as `data:image/...;base64,...`; the app
    reads these and moves the picture into its store.
- `rules`: the ruleset the character uses, `mm` (Materia Mundi), `e9`, or `e9mm`
  (E9 for Materia Mundi). Older
  files that say `1e` are read as `mm`.
- `origin`: for `mm`, `human`, `barbarian`, `dwarf`, `elf`, `gnome` or `beastfolk`;
  for `e9`, `human`, `elf`, `dwarf` or `gnome`.
- `class.name`: for `mm`, `warrior`, `scout`, `wizard`, `priest`, `stalwart`, `delver`,
  `dweomersmith`, `champion`, `hunter`, `bard` or `druid`; for `e9` and `e9mm`, `fighter`,
  `expert`, `wizard` or `priest`. A combined class joins its parts with `+`, as in
  `fighter+dweomersmith`; `e9mm` dwarves, elves, gnomes and beastfolk always use one (also `dweomersmith` and `druid`; older `champion`, `hunter` and `bard` parts read as `fighter` and `expert`).
- Magic-users carry their magic in `inventory`, since preparations are physical
  objects. `book` is the spellbook, prayer book or craftbook (a druid's known glamours),
  and `prepared` lists each preparation and what it holds. Magic from the equipment
  file has a `ref` and its name in `magic`; its circle comes from the file. Anything
  else is written in with its `circle`: the spell circle, or the rarity for dweomers
  (1 common, 2 uncommon, 3 rare, 4 legendary). A dweomer that can be made at several
  rarities keeps its `circle` too. A plain name that matches the class's magic in the
  equipment file gets its `ref` on import.

  ```json
  "book": [{ "ref": "mm:bless", "magic": "Bless" }, { "magic": "Saint Brendan's Blessing", "circle": 3 }],
  "prepared": [{ "ref": "mm:bless", "magic": "Bless", "spent": false }]
  ```
- `inventory.armor`, `inventory.weapons` and `inventory.items` are items. `worn` is the `id` of the armor
  being worn and `wielded` holds the `id`s of the weapons in the main and off hands
  (`""` for an empty hand; the same `id` twice for a medium weapon held two-handed).
  See below.
- `id` is optional; importing a sheet with the same `id` updates that character
  instead of adding a copy.
- `campaign`: the id of the campaign the character was made for; left out for
  characters made on This device. See [EQUIPMENT_FORMAT.md](EQUIPMENT_FORMAT.md).
- `custom` (exported files only): copies of the custom equipment entries the
  character uses, each with the `file` it came from, so the sheet opens on a device
  that doesn't have them.

## Armor, weapons and other equipment

Each piece of armor, each weapon and each other item has its own `id`, so the sheet can
say which ones are worn and wielded. An item from an equipment file has a `ref` such as
`"mm:longsword"` (see [EQUIPMENT_FORMAT.md](EQUIPMENT_FORMAT.md)); its numbers come from
that file, and the sheet keeps only what is unique to this one:

- `name`: what the player calls it ("Grandmother's dagger").
- `bonus`: masterwork, added to armor's defense or a weapon's damage (never to attack throws).
- `enchantment`: the dweomer that makes it a magic item, as `{ "ref": "mm:flametongue",
  "name": "Flametongue", "rarity": "uncommon", "charges": 2, "quality": "fair",
  "cursed": true }`. Only `ref` or `name` is needed: `rarity` only for a dweomer that
  comes in several rarities, `quality` (`good`, `fair`, `poor`) for arcane items,
  `element` (`"fire"`, `"cold"`, ...) for an elemental item. Free
  text such as `"Blessed by Saint Olaf"` is kept as written, and a bare `"mm:..."` ref
  works too. Rings, amulets, potions and other carried magic items are items in
  `inventory.items` with an `enchantment`.
- `qty`: for other equipment, how many (1 if left out).

On the sheet, **Customize** turns a referenced weapon or armor into a custom one whose
numbers can be edited. A custom item, or one whose `ref` points at a file this device
doesn't have, is saved with all its numbers:

Armor:

- `type`: `light`, `medium` or `heavy`, which sets its defense (1, 2 or 3).
- `encumbrance`: 1, 2 or 3 by default.

Weapons and shields:

- `type`: the kind from the equipment list, such as `Longsword` or `Shield`.
- `size`: `light`, `medium` or `heavy`. Light weapons deal d6; medium deal d6+Str in one
  hand or 2d6 in two; heavy deal 2d6+Str (ranged: d6, d6, 2d6). Light weapons and
  shields take one hand and heavy weapons both; a medium weapon takes one or two,
  chosen when it's wielded.
- `encumbrance`: 0 for light and medium weapons carried at the ready, 1 for heavy
  weapons and shields, 2 for polearms and greatbows (Materia Mundi).
- `reach`: extra melee reach in paces. `range`: short range (or thrown range) in paces.
- `ranged`, `shield`: true or false.
- `properties`: the list's other properties.

When writing a sheet by hand, a weapon or armor can give just `type` (`"Longsword"`,
`"heavy"`) and an item can be a plain name (`"Rope"`); the app finds them in the
ruleset's equipment file and adds the reference.

The off hand can hold a shield or a light melee weapon (which adds its d6 to the main
hand's damage), as long as the main hand isn't using both hands. A medium weapon held
two-handed has its `id` in both places in `wielded`.

Version 2 sheets, which copied every number into the sheet and listed other equipment
as plain names, still import: items whose numbers match the equipment file get a
`ref`, and anything edited away from the file stays custom. Version 1 sheets, with
`"armor": { "rating", "worn" }` and weapons as `name`, `damage` and `range`, still
import too.
