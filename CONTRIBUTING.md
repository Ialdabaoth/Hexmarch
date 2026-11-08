# Contributing to E9 and Materia Mundi

E9 is an old-school (B/X-family) fantasy RPG system, and Materia Mundi is its flagship setting. The project ships three things together: books, apps (E9 Companion and E9 Atlas, with a third, Scribe, planned) and modules (adventures and hexcrawls that run in both apps). Heph (GitHub `Ialdabaoth`) owns the game, writes the books and has the final say on canon and prose.

## How work is organised

Every piece of work has one home thread, named by what it is and which version it is in:

| Kind | Home | Example |
| --- | --- | --- |
| A new idea | a Brainstorm | "Brainstorm hex tile style" |
| An agreed strategy | a Develop | "Develop artist onboarding" |
| An app | one home per app, per minor version | "Atlas 0.5.X Development" |
| A module | one home per module, per minor version | "Module: Hansa 0.2.X Development" |

- An idea starts as a Brainstorm. When it turns into work, it moves to a Develop thread or to the app or module it touches, and the Brainstorm closes. It can be reopened for big-picture thinking.
- Each app and each module has exactly one open home at a time. When the version goes from 0.N.X to 0.N+1.0, the old home closes and a new one opens.
- Changes go to the home of the app or module they touch, even when the idea started elsewhere. Leave a link back to where it came from.
- Work that cuts across several apps or modules goes back to a Brainstorm first.

## Apps and modules

- **E9 Companion** (`companion-app/`): the player and referee PWA. Changelog: `companion-app/CHANGELOG.md`.
- **E9 Atlas** (`modules/tools/`): the map builder and viewer, live at https://ialdabaoth.github.io/MateriaMundiRPG/atlas/. Changelog: `modules/tools/CHANGELOG.md`.
- **Scribe** (planned): a WYSIWYG module creator.
- **Modules** (`modules/<id>/`): Beyond the Pale: The Isle of Mists, 1422 (`isle-of-mists`), Hansa (`hansa`), and the E9, MM and MM-for-E9 core modules.

The data formats are specified next to the code: `modules/MODULE_FORMAT.md`, `ATLAS_FORMAT.md`, `CREATURES_FORMAT.md`, `ENCOUNTER_FORMAT.md`, `EVENTS_FORMAT.md`, `WORKFLOWS.md`, `BUILDING_A_MODULE.md`, and `companion-app/*_FORMAT.md`. Ideas that aren't agreed yet go in `modules/PROPOSALS.md`, not in the specs.

Every project goes through five phases in order: product design, Companion integration, Atlas integration, print layout (Affinity Publisher), and release and marketing.

## Canon

Rules and setting questions are settled by two sources:

1. The **E9 System Reference Handbook**.
2. The **Materia Mundi Compendium**.

The MM Player's Handbook and the four MM Magic-User Handbooks are canon too, but they should hold nothing that isn't in the Compendium. If you find a difference, report it rather than picking a side.

Everything else (the old Referee's Guide, playtest sheets, older drafts, work-in-progress modules, brainstorm notes) is not canon. Don't cite it. Nothing joins the canon list until Heph approves it.

Link rules to the wiki (https://github.com/Ialdabaoth/MateriaMundiRPG/wiki) where you can, or cite the Compendium by page. The wiki is the source of truth; don't bulk-edit it.

## Prose belongs to Heph

Heph writes the published prose in his modules and books: room and scene descriptions, creature descriptions, boxed text, players' text and site notes.

- Use his text **word for word**. Splitting a passage across rooms or fields is fine; rewording is not.
- If a passage has to change (a rules name, a date, a canon fix), show the before and after and wait for his OK.
- Where he hasn't written anything yet, leave the field empty or mark it `TODO (Heph)`. Don't fill it in.
- **No LLM-generated descriptive prose** in his modules or books.

Data is fine to write: stats, ids, relations, coordinates, rules mechanics, UI labels.

## House style

- No TSR or other trademarked names in titles or copy.
- Random tables use only d20 and d6.
- Local creature names come first, with the MM rules name in brackets the first time per scene.
- Dates use the MM calendar (MM year = AD + 2085).

## Licences and credit

The suite and its modules are **CC BY 4.0** (see [LICENSE.md](LICENSE.md)): anyone may reuse them with credit. Anything AI-assisted that Bakagaijin Productions releases is always CC BY 4.0.

- **Your own work** is yours to license, and the terms are agreed when you're invited. Anything that goes into the suite or into one of its modules is released under CC BY 4.0, with you credited.
- **Purely human work** that the suite uses without changing it (for example an artist's finished piece shown as-is) can be agreed case by case.
- **Third-party material** keeps its licence: E9 System Reference Handbook data (CC BY-SA 4.0), SRD 5.2 data (CC BY 4.0), C. Martins hex tiles in `modules/assets/tiles` (CC BY-SA 4.0; edits stay CC BY-SA and are credited "Art by C. Martins, edited by …"), and map data sources.
- Only bring in material you made yourself or that has a licence that allows it. List every outside source under `credits` in the module's `module.json` (shown in the Atlas Credits dialog) with its licence.

## Pull requests

- Work on a branch and open a PR against `main`. Heph reviews and merges.
- **Every merge to `main` restarts the site deploy and cancels the one in flight**, so PRs are merged in batches. Yours may wait for the next batch; that's normal.
- One PR per change, in the home of the app or module it touches. Bump the version and add a changelog line.
- Any edit to the map build tools (`modules/tools/build.py` and friends) redraws every map on the next build, so say so in the PR.
- If your PR touches prose, include the before/after list.
