# Contributor Guidelines

> The primary goal of a VTT is to retain customers. The secondary goal of a VTT is to help you play your game. Hexmarch is FOSS from top to bottom, in order to eliminate the primary goal and force us to focus on the secondary. It's *YOUR* game.

Hexmarch is three apps for OSR hexcrawl games under any core rules: the **Companion** (`companion-app/`), the **Atlas** and map tools (`modules/tools/`) and **Scribe** (`scribe/`), plus the **Launcher** (`launcher/`), the shared editing engine (`engine/`), the example root rules module (`modules/e9-core/`) and the VTT bridges (`vtt/`). Setting data, adventure modules and format specs live in the data repo, [Ialdabaoth/MateriaMundiRPG](https://github.com/Ialdabaoth/MateriaMundiRPG) (named in `site.json`). Heph (GitHub `Ialdabaoth`) owns the project and has the final say.

These guidelines are written for people and for their AI assistants alike. If you work with Claude or another agent, point it at this file and at [AGENTS.md](AGENTS.md).

## Getting started

1. **Fork** this repo (preferred). Collaborator access is possible on request, but a fork is all you need.
2. In your fork, set **Settings → Pages → Source** to **GitHub Actions**, then run the **Site (Hexmarch apps)** workflow. Your copy deploys to `https://<you>.github.io/<repo>/`. Every app uses relative paths, so `_site/` works at any address.
3. Build locally with the commands in [README.md](README.md#build). `scripts/data.sh` clones the data repo for the parts the build needs.
4. Open PRs from a branch of your fork against `main` here.

## How work is organised

**One contributor, one lane.** Each contributor takes one app (Companion, Atlas, Scribe, Launcher, engine, VTT bridges, icons) or one module, and keeps to it. That keeps PRs from colliding and matches what CI enforces (below).

**Changes that touch more than one app** go through Heph's cross-app planning ("Plan the Hexmarch MVP across all apps"). Don't open a cross-app PR yourself: open an issue describing it, or push your branch and ask Heph to fold it into the combined PR.

## Design decisions to know

These are settled. A change that works against one of them needs Heph's OK first (open an issue).

- **Apps talk by links.** A message from one app to another is a link with the data after `#` (for example `/scribe/#m=<data>`), so it never reaches a server. It carries changes only and a message id, so opening it twice is safe. Messages over 4096 bytes go in an envelope that points to a public URL. A running number per campaign lets an app spot a gap and reload the snapshot.
- **Storage is only a cache.** What the browser keeps can be wiped at any time. The campaign's published files are the truth; the apps sharing one browser profile is a shortcut, never a requirement.
- **Scribe is the only publisher.** The GitHub key never leaves Scribe. Atlas and the Companion send Scribe an update link; Scribe publishes and returns the user. The first publish is always a deliberate button.
- **Parties.** A campaign has no single start: it has the set of start locations from its modules. The referee creates **parties** in the Atlas (name plus one start, or "place the party yourself"). Each party has its own clock and session numbering, every character belongs to a party, and an invitation names a party. The Atlas builds parties and hands each "Invite a player" to the Companion.
- **Knowledge belongs to creatures.** What a player sees is "what does this character know?", stored with the creature as dated knowledge entries, not in the campaign state.
- **Launcher and app scopes.** The site root is the Launcher (the apps, what this device holds, backup and reset). The apps sit beside it at `companion/`, `atlas/` and `scribe/`, each with its own manifest and install scope. A link for another app opens in that app, never inside the current one (`engine/handoff.ts`).
- **UI rule.** Explanations go in tooltips that also work on tap. Status and errors stay visible on screen.
- **Cost rule.** Only free or cheap services and tools. Players need nothing but URLs; any accounts are on the referee's side.

## Where we are

The apps move together by minor version. Now: **0.6.X Integration**. Next: 0.7.X UX (privacy, encryption, seats), 0.8.X private alpha, 0.9.0 format lock, 0.9.X public beta, then 1.0.0.

- **No migration shims before 0.8.X.** Until then only Heph and the developers use the apps, so formats can change without upgrade code.
- **Honest table until 0.7.** Privacy work comes in 0.7; until then, assume nobody cheats.

## Content rules

The apps are rules-agnostic, but modules and examples carry Heph's setting.

- **Never invent lore.** Convert text as written.
- **Heph's prose is used word for word.** Splitting a passage across fields is fine; rewording is not. Where he hasn't written anything, leave the field empty or mark it `TODO (Heph)`. No AI-generated descriptive prose.
- Data is fine to write: stats, ids, coordinates, rules mechanics, UI labels.
- No TSR or other trademarked names in titles or copy.

For canon, house style and module work, see the data repo's [CONTRIBUTING.md](https://github.com/Ialdabaoth/MateriaMundiRPG/blob/main/CONTRIBUTING.md).

## Licences and credit

Everything in this repo is **CC BY 4.0** unless marked otherwise (see [LICENSE.md](LICENSE.md)). Credit line: "E9 / Materia Mundi by Heph (Bakagaijin Productions), CC BY 4.0". Anything AI-assisted that goes into the suite is always CC BY 4.0, with you credited.

- Your contributions go in under CC BY 4.0. Other terms (for example an artist's finished piece used as-is) are agreed case by case with Heph.
- Third-party parts keep their licences. Icons: the Atlas icon uses C. Martins' Hex Tiles: Fantasy (CC BY-SA 4.0); the Scribe icon uses Twemoji (CC BY 4.0). Details and credit wording are in [icons/README.md](icons/README.md); other credits are in `companion-app/LICENSE.md` and `modules/tools/LICENSE.md`.
- Only bring in material you made yourself or that has a licence that allows it, and credit it.

## Pull requests

- **One open PR per app.** Before opening one, look at the open PRs. If one already changes the same app, wait for it to merge, or open yours with `Merge after #N` in the description. A PR that needs another PR's work says `Merge after #N` too.
- CI runs two checks: the **build**, and **merge order**. Merge order keeps a PR yellow while a PR it names in `Merge after #N` is unmerged, or while an older open PR changes the same app (Companion, Atlas, Scribe, engine, e9-core, VTT bridges, icons). It turns green by itself when the predecessor merges. A PR that truly doesn't care can say `Merge order: any` on a line of its own.
- **Don't edit a version number or a CHANGELOG.md**: add a change note (next section). CI fails a PR that numbers one by hand.
- Refer to another change by its PR number (`needs #15`), not by a version you expect it to get.
- Before you push, merge `main` into your branch if it moved, and run the checks for what you changed: `scripts/data.sh`, then `npm run check && npm test` in `companion-app/` or `scribe/`.
- Any edit to the map build tools (`modules/tools/build.py` and friends) redraws every map, so say so in the PR. If your PR touches prose, include a before/after list.
- Heph reviews. When he approves, he enables **auto-merge**, and GitHub merges the PR as soon as both checks are green. Don't merge or enable auto-merge yourself.

## Versions and change notes

The version files (`companion-app/package.json`, `modules/tools/ATLAS_VERSION`, `scribe/VERSION`, `modules/e9-core/module.json`) hold the **last release**. A PR adds one note per app it changes instead:

```
modules/tools/changes/fog-of-war.md      the changelog entry's text, no version number
companion-app/changes/fog-of-war.md      the same PR's Companion entry
```

Name the file for the change; two PRs add two files, so they never collide. When the site builds, `scripts/changes.py stamp` gives each note the next patch number in the order the PRs reached `main` and shows it in the app and in CHANGELOG.md on the site.

- `python3 -I scripts/changes.py list` shows each app's version now and which note got which number.
- `python3 -I scripts/changes.py release <app>` folds the notes into CHANGELOG.md and writes the version; `minor <app>` does that and starts the next minor. That is its own PR, and the only kind that edits versions.
