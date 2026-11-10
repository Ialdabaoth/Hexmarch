# Hexmarch Companion

A small installable web app (PWA) for players of OSR hexcrawl games (E9 and its settings, Materia Mundi among them, so far): roll up and keep characters,
manage a retinue of followers and beast companions, tap any stat to roll it, and send rolls to Discord.

Everything is stored on the device. There are no accounts and no server: a campaign is published as two static files (`campaign.json` and `snapshot.json`) on any host the referee picks.

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
- **Campaigns and seats**: Settings › Campaign lists one entry per invitation. **Referee mode** sees everything in the campaign; **player mode** sees the player's own character and followers, the party, and the map as that character knows it.
- **Invitations**: the referee copies an invitation link (optionally for a given character); opening it adds the campaign in player mode.
- **Inbox**: a player sends their character to the referee as a join request (one POST to the campaign's post URL, or a file to pass on); the referee approves it or sends it back with a note, and the player follows where it stands.
- **Update campaign**: the referee saves the campaign as players will see it (the clock, the party, what each character knows, and the requests answered) as `campaign.json` and `snapshot.json` to upload; players get it with Check for changes.
- **Links between the apps**: Scribe's "Open in the Companion" link brings the campaign here in referee mode, and Settings › Send play to Scribe sends play back (`#m=` links, `engine/mail.ts`).
- **Maps**: Campaign › Maps embeds the Hexmarch Atlas for the campaign's modules, with the party marker, the clock and fog of war; in player mode it shows only what the character knows.

## Sheets and characters

A **character sheet** (`src/lib/sheet.ts`) is what gets saved and exported: a chronicle of
creation and level-ups with no derived values. A **character** (`src/lib/character.ts`) is
the live version, rebuilt from the sheet on every load or change, with current HP and
temporary effects on top. `character.hp` is current HP and `character.sheet.hp()` is max HP;
`character.con` includes effects and `character.sheet.con()` is permanent. The file format
is documented in [CHARACTER_FORMAT.md](CHARACTER_FORMAT.md).

## Rules data

The app supports these rulesets, each one JSON file:

- `modules/mm-core/rules.json` (the MM module, at the repository root): Materia Mundi, with page references to the first-edition Compendium.
- `modules/e9-core/rules.json` (the E9 module, at the repository root): E9, from the E9 System Reference Handbook (CC BY-SA 4.0).

Each file holds the origin roll tables, origins and classes, plus a `mechanics` block for
the rules that differ between the two. In E9 only fighters add their level to attack throws
(`"attackProgression": "fighters"`); in Materia Mundi every class does (`"all"`).
Materia Mundi also has a one-roll follower table (`quickNpc`); without one, the app rolls
an origin and a random class from that origin's list.

Edit the files to change them (a test checks that every id they mention exists and that each
roll table covers every face of its die). The engine that reads them is `src/rules/rules.ts`.
A third file, `modules/mm-core/e9/rules.json` ("E9 for Materia Mundi", the MM module's E9 option, was `e9mm-options.json`), uses E9's rules with Materia
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
`src/equipment/` and the MM module: `modules/mm-core/equipment.json` (Compendium, with prices in silver, and its 48
spells, 56 miracles, 40 glamours and 120 dweomers, each with a one-line summary and
page number) and the E9 module's `modules/e9-core/equipment.json` (E9 arms and armor, no prices). Each ruleset names
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

The build uses relative paths, so `dist/` works at any address (a site root, `/Hexmarch/companion/` on GitHub
Pages, or any other folder) with no settings. It expects the Launcher, the Atlas and Scribe beside it, one folder up
(`../atlas/`, `../scribe/`).

## Versioning

The released version lives in `package.json`; the version the site shows (under About in Settings) is that plus one patch per change note in `changes/`, worked out by `scripts/changes.py` when the site builds.

- Every merged PR bumps the patch number: 0.2.0, 0.2.1, 0.2.2, …
- Each sprint (a planned set of features, such as the 0.2 equipment work) bumps the minor
  number and resets the patch: 0.3.0. Saved sheets carry their own format `version`
  (see CHARACTER_FORMAT.md), separate from the app's.
- The apps move together: 0.6.X integration, 0.7.X UX, 0.8.X private alpha, 0.9.0 format lock, 0.9.X public beta, then 1.0.0 (WORKFLOWS.md "Versioning"). Until 0.8.X the only users are the developers, so formats change without compatibility shims.

Don't bump `version` in a PR: add a change note in `changes/` instead (CONTRIBUTING.md "Versions and change notes").

## Licensing

The app's code is CC BY 4.0, like the Atlas tools; its rules data files keep their sources' licences. Details in [LICENSE.md](LICENSE.md).

The book includes material derived from the System Reference Document 5.2 by Wizards of the Coast LLC
(CC BY 4.0); the app's About screen carries that attribution.

## Later

Open work is tracked in the Companion 0.6.X development thread and the data repo's WORKFLOWS.md: the Link adapter (messages as share links), the `hexmarch-` protocol names, seats and join codes, and opening shared links and files straight into the app (`share_target`, `launch_handler`).
