# Materia Mundi Companion

A small installable web app (PWA) for players of the Materia Mundi RPG: roll up and keep characters,
manage a retinue of followers and beast companions, tap any stat to roll it, and send rolls to Discord.

Everything is stored on the device. There are no accounts and no server.

## What it does

- **Character builder** following the Compendium's four steps: origin (rolled or chosen), abilities
  rolled in order (4d6 drop for enhanced and deficient abilities), talent spread, class, starting HP
  and gear. Scores can also be entered by hand to copy over an existing sheet.
- **Character sheet** with tap-to-roll attacks, saves, talents, ability checks and weapon damage.
  An Easy / Normal / Hard toggle applies the two-dice rule to the next roll. Tracks HP, XP and
  level-ups (thresholds, hit die, talent training).
- **Retinue**: follower limit from Bearing, beast companion HD for hunters and druids, loyalty,
  morale and "direct follower" rolls, and one-tap minions from the one-roll NPC table.
- **Dice roller**: quick dice, expressions like `2d6+1` or `4d6kh3`, rolls against a threshold,
  and a roll history.
- **Discord**: paste a channel webhook in Settings to send rolls, one at a time or automatically.
- **Effects**: temporary boosts and debuffs to abilities, talents or HP that change the
  live numbers without touching the sheet.
- **Portraits**: pick a photo; it is shrunk to 256×256 and saved in the sheet.
- **Backup**: export and import character sheets as JSON.

## Sheets and characters

A **character sheet** (`src/lib/sheet.ts`) is what gets saved and exported: a chronicle of
creation and level-ups with no derived values. A **character** (`src/lib/character.ts`) is
the live version, rebuilt from the sheet on every load or change, with current HP and
temporary effects on top. `character.hp` is current HP and `character.sheet.hp()` is max HP;
`character.con` includes effects and `character.sheet.con()` is permanent. The file format
is documented in [CHARACTER_FORMAT.md](CHARACTER_FORMAT.md).

## Rules data

The app supports two rulesets, each one JSON file in `src/rules/options/`:

- `mm-options.json`: Materia Mundi, with page references to the first-edition Compendium.
- `e9-options.json`: E9, from the E9 System Reference Handbook (CC BY-SA 4.0).

Each file holds the origin roll tables, origins and classes, plus a `mechanics` block for
the rules that differ between the two. In E9 only fighters add their level to attack throws
(`"attackProgression": "fighters"`); in Materia Mundi every class does (`"all"`).
Materia Mundi also has a one-roll follower table (`quickNpc`); without one, the app rolls
an origin and a random class from that origin's list.

Edit the files to change them (a test checks that every id they mention exists and that each
roll table covers every face of its die). The engine that reads them is `src/rules/rules.ts`.
A third file, `e9mm-options.json` ("E9 for Materia Mundi"), uses E9's rules with Materia
Mundi's origins as race-as-class. An origin whose class list holds one combined class, like
`"classes": ["fighter+dweomersmith"]`, always takes all of those classes at once. A combined
class levels every part together on one XP track. It gets the best hit die bonus, every
part's features, talent training and feats, the first part's magic and proficiencies, and
the worst prime for experience. Classes borrowed from the Compendium carry `"book": "Compendium"`
so page numbers point to the right book.

Every character records its ruleset in `"rules"` (`"mm"` or `"e9"`), and the character
builder asks which one to use.

The origin roll is a chain of tables: each result either names an origin or sends you to roll
on another table (`"table": "fey"`), so a campaign can, say, make 1-4 human and drop the fey
roll by editing only the JSON.
When the revised edition arrives, add a new options file with its own id (say `mm2`) and
register it in `RULESETS`, instead of editing the old one, so existing characters keep their rules.

## Equipment data

Armor, weapons, gear, mounts, services and magic live in equipment files in
`src/equipment/`: `mm-equipment.json` (Compendium, with prices in silver, and its 48
spells, 56 miracles, 40 glamours and 120 dweomers, each with a one-line summary and
page number) and `e9-equipment.json` (E9 arms and armor, no prices). Each ruleset names
its files in `"equipment"`; `e9` and `e9mm` use E9's arms and armor with the
Compendium's gear and magic (E9 has no spell list of its own).
Sheets point at entries with references like `"mm:longsword"` and save only what's
unique to each item (name, bonus, enchantment, quantity).
`src/equipment/equipment.ts` loads them, and a test checks every entry.

Each device also has its own custom equipment file, edited in the Campaign tab, under Custom
equipment. A referee can publish theirs as a **campaign**: a `campaign.json` naming the
rules and equipment files, put on any site that lets other sites read it (GitHub
Pages, a gist). Players paste its link into the Campaign tab
(`src/lib/campaign.ts`). Exported characters carry the custom entries they use. The
format, campaigns included, is in [EQUIPMENT_FORMAT.md](EQUIPMENT_FORMAT.md).

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests for dice and character rules
npm run check    # type check
npm run build    # production build in dist/
```

Set `BASE_PATH` when the app is served from a subpath, e.g. `BASE_PATH=/MateriaMundiRPG/ npm run build`
for GitHub Pages.

## Versioning

The version lives in `package.json` and shows under About in Settings.

- Every merged PR bumps the patch number: 0.2.0, 0.2.1, 0.2.2, …
- Each sprint (a planned set of features, such as the 0.2 equipment work) bumps the minor
  number and resets the patch: 0.3.0. Saved sheets carry their own format `version`
  (see CHARACTER_FORMAT.md), separate from the app's.
- 1.0.0 is the first release announced to players.

Bump `version` in both `package.json` and `package-lock.json` in the PR itself.

## Licensing

The book includes material derived from the System Reference Document 5.2 by Wizards of the Coast LLC
(CC BY 4.0); the app's About screen carries that attribution.

## Later

- 3D dice: when you roll, WebGL dice tumble onto the card and land showing the result
  the app rolled (for example with three.js and a small physics engine, loaded only
  when the feature is switched on so the app stays small).
