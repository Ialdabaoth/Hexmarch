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

"Export JSON" on a sheet writes one character sheet. "Export all" writes
`{ "format": "materia-mundi-characters", "version": 1, "characters": [ ... ] }`.
Import accepts either, so sheets can also be written or edited by hand.

```json
{
  "format": "materia-mundi-character",
  "version": 1,
  "rules": "mm",
  "id": "c0ffee00-0000-4000-8000-000000000001",
  "name": "Holly",
  "portrait": "",
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
  "inventory": {
    "armor": { "rating": 2, "worn": "Light armor" },
    "weapons": [{ "name": "Hand crossbow", "damage": "d6", "range": "ranged" }],
    "items": ["Two daggers", "Lockpicking tools", "Dungeoneer's kit"],
    "book": [],
    "prepared": []
  },
  "followers": [],
  "notes": ""
}
```

## Changes are tallies

Anything that changes a talent or hit points is written as a number keyed by its
name, so a quick scan of the sheet can add them up.

- Every talent starts at 5+. Each `"agility": 1` anywhere in the sheet improves it
  one step and each `"agility": -1` worsens it one step:

      threshold = 5 − (sum of all "agility" entries)

  In the example, `"stealth": 1` appears twice in `levelups`, so Stealth is 3+.
  `"agility": 1` appears once under `abilities.dex`, so Agility is 4+.
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

- `portrait`: an image, either inline or an `https://` link. Empty for none. The app
  shrinks pictures to 256×256 and writes `data:image/jpeg;base64,...`, or
  `data:image/png;base64,...` when the picture has see-through areas.
- `rules`: the ruleset the character uses, `mm` (Materia Mundi), `e9`, or `e9mm`
  (E9 for Materia Mundi). Older
  files that say `1e` are read as `mm`.
- `origin`: for `mm`, `human`, `barbarian`, `dwarf`, `elf`, `gnome` or `beastfolk`;
  for `e9`, `human`, `elf`, `dwarf` or `gnome`.
- `class.name`: for `mm`, `warrior`, `scout`, `wizard`, `priest`, `stalwart`, `delver`,
  `dweomersmith`, `champion`, `hunter`, `bard` or `druid`; for `e9`, `fighter`,
  `expert`, `wizard` or `priest`. A combined class joins its parts with `+`, as in
  `fighter+dweomersmith`; `e9mm` dwarves, elves, gnomes and beastfolk always use one.
- Magic-users carry their magic in `inventory`, since preparations are physical
  objects. `book` is the spellbook, prayer book or craftbook (a druid's known glamours),
  and `prepared` lists each preparation and what it holds. `circle` is the spell
  circle, or the rarity for dweomers (1 common, 2 uncommon, 3 rare).

  ```json
  "book": [{ "magic": "Bless", "circle": 1 }],
  "prepared": [{ "magic": "Bless", "circle": 1, "spent": false }]
  ```
- `id` is optional; importing a sheet with the same `id` updates that character
  instead of adding a copy.
