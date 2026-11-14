# Hexmarch pre-1.0 roadmap (0.6.X to 1.0.0)

**Draft 1, 2026-11-09.** Written after the alpha walkthrough passed ("IT WORKS!", 17:05) and all three apps moved to 0.6.0.
Sources: project memory (roadmap, campaign publishing, Companion modes, Scribe, rules modules, ACKS, OBX, Mystara), `strategy/mvp-checklist.md`, and the three 0.6 handoffs (`companion/handoff-0.6.md`, `scribe/handoff-0.6.md`, `strategy/handoffs/atlas-0.6.x.md`).

Nothing here is new direction. It takes the stages Heph set and fills each one with concrete work, in order, with what blocks what. Items marked **Decide** need Heph. Sizes: **S** one small PR, **M** one or two PRs, **L** several PRs.

## The stages (Heph, 2026-11-09)

| Stage | Name | Goal in one line | Exit test |
|---|---|---|---|
| now | Alpha follow-up | Scribe runs ACKS, Mystara and other sample systems | Heph builds a campaign on each sample root without help |
| 0.6.X | Integration sprint | Real, free tools carry the game between devices; remote-play fundamentals | A remote session with no hand uploads and no shared browser profile |
| 0.7.X | UX sprint | Privacy (encryption, seats), content readiness, remote-play UX | A stranger can be invited, play a session of B2, and never see another player's secrets |
| 0.8.X | Private alpha | Real campaigns with a few outside tables | Two or three tables finish several sessions; bugs triaged |
| 0.9.0 | Format lock | Every file format frozen | Each format has a spec, a schema, a validator and a migration path |
| 0.9.X | Public beta | Anyone can find, install and use the apps | Public launch, feedback flowing, no format breaks |
| 1.0.0 | Release & maintenance | Stable apps, steady module drumbeat | Support and release routine in place |

## Standing rules that shape the plan

- **No compatibility shims before 0.8.X.** Only Heph and Claude use the apps, so every format change is a clean break; test files get rebuilt. This makes 0.6 and 0.7 the cheap time to change formats, and it is why the `hexmarch-` rename goes first.
- **Free tools only** (cost rule). This rules out paid relays such as a TURN server, hosted databases and paid store listings.
- **Honest table until 0.7.** Readable snapshots are fine until the privacy work lands.
- **Apps talk by links;** storage is only a cache. Each app owns its own data.
- **One open PR per app,** change notes not hand versions, Heph merges (Hexmarch AGENTS.md).
- **Mystara and ACKS stay private.** They never go in a public repo, a screenshot or a Pages build.

---

## Now: alpha follow-up (before the 0.6 work starts in earnest)

Heph's roadmap step 2: Heph works Scribe to get ACKS, Mystara and other systems working. Claude's job is to fix what he finds, in the Scribe 0.6.X thread.

1. **Sample systems in Scribe.** Each root needs to be pickable in step 1 and its modules in step 2.
   - **OBX** (`obx-core`): add it to Hexmarch `site.json` `data.copy` and wire `derive.json` into the Companion layout engine. (**M**)
   - **Mystara** (private): the custom scale ladder (64 mi / 8 mi / 1 mi / 660 ft / 60 ft) and a private module folder that Scribe can open from a local file, the way the Atlas opens `.e9atlas.json`. (**M**)
   - **ACKS** (private): blocked on a private repo (e.g. `Ialdabaoth/acks-core`) and the core rulebook PDF in Drive. (**L** once unblocked)
2. **The `hexmarch-` protocol rename** (Companion 0.6.X thread owns it, both repos). Do it before anything else is built on the old names. Clean swap, `mm.json` becomes `hexmarch.json`, rebuild the Mystara file. (**L**, one paired PR)

## 0.6.X Integration sprint

**Goal:** the game moves between devices through real, free tools, and the two-Chrome-profiles class of bug is gone for good.

### Shared (engine, all apps)

| # | Work | Size | Depends on |
|---|---|---|---|
| E1 | `hexmarch-` rename | L | nothing; do first |
| E2 | **Link adapter**: share links through the OS Share API; up to 4096 bytes inside the link, bigger payloads as an envelope holding a public URL; running update number per campaign, a gap means reload the full snapshot | M | E1 |
| E3 | **share_target and launch_handler** in each app's manifest so a shared link or message file opens in the installed app; protocol and file handlers where browsers allow | S | E2 |
| E4 | **Campaign folder** as the durable home: a folder of small files via the File System Access API, download/upload fallback where it isn't supported (Firefox, iPhone) | M | **Decide D1** |
| E5 | **Hosting adapters**, all free: Manual (any static host, today), Drive (no API key, `drive.usercontent.google.com` rewrite), **Apps Script** (the referee's own web app: automatic upload plus a post URL for join requests), GitHub Pages via a pasted token (optional) | L | E2 |
| E6 | **Lockfile and dependency check** in the engine: exact versions and hashes, `requires` checked, one-card updates with release notes | M | nothing |

### Hexmarch Companion

1. Link adapter on the Companion side, then share target (E2, E3).
2. **Procedures engine, first slice**, then **Open and Close session** (d20/d6 tables, branches, descriptions per EVENTS_FORMAT). Close session writes XP, loot, map and clock changes and runs Update campaign. (**M** + **M**) See **Decide D2**.
3. **Events log** with manual buttons (encounter, discovery, loot, note). (**S**)
4. **Live channel, fallback first:** small update links and "Check for changes" polling; then **WebRTC** with the handshake carried as two links (no TURN, so some networks will fall back). Roll prompts to phones, pushed descriptions and handouts. (**L**)
5. Discord webhook tested on a real device. (**S**)
6. Optional Test button using the engine's `checkUpload`. (**S**)

### Hexmarch Atlas

1. Move the Scribe→Atlas hand-off from shared storage to links. (**S**)
2. **Run procedures** (shares the engine from Companion item 2), starting with `sight-range`; add the "charted" fog state. (**M**)
3. Module pinning from the campaign lockfile (E6). (**S**)
4. Site finder (Irish or English names). (**S**)
5. Remote-play fundamentals on the map: the player view follows party moves and reveals from update links. (**S** after E2)
6. VTT: test the Foundry bridge in a live world; Owlbear Rodeo extension; "Open in…" links. (**M**, can slip to 0.7)

### Hexmarch Scribe

1. Campaign view **steps 4 to 6**: conflicts and slicing, own content as field-level patches, parties and secrets. (**L**)
2. **Update checker** (quiet / needs a decision / blocked) on opening any module, using E6. (**M**)
3. Publish through the hosting adapters (E5) instead of hand uploads. (**M**)

### Rules modules and content conversion

- `e9-core` and `mm-core`: close the known rules gaps (druid iron, priest domains, Elemental Wall) as Heph words them.
- OBX: wired and loadable (see "Now"). Rules text waits for the CC version of the OSE SRD ("early 2027").
- Beyond the Pale (`isle-of-mists`): the first start's real date replaces the 3507-05-01 placeholder; B2 castle maps from Heph.

**0.6 exit test:** Heph runs a short remote session: referee on the laptop, two players on phone and Chromebook, everything moving by links and the Apps Script or Drive adapter, Open and Close session run as procedures.

## 0.7.X UX sprint

**Goal:** the apps are safe and pleasant for people who aren't us.

### Privacy and seats (the biggest item; blocks 0.8)

1. **Device keys** as identity; **seats with join codes** (a join code becomes the invitation); **seat rescue** (new code, old key dies, new device ingests the seat's data); second device added by QR from the first. (**L**)
2. **Per-recipient encryption** of snapshot parts and update links (one snapshot, an encrypted part per character). Knowledge leaves plain JSON. (**L**, after 1)
3. **Referee party switching** (needs multi-party state). (**M**)

### Remote-play UX

- Roll prompts, pushed handouts and descriptions polished for phones; clear "you are behind, reload" states when an update number is missed.
- iPhone fallbacks where share target and File System Access don't exist.
- Save nudges for the referee's campaign folder (**Decide D1** sets how often).

### App UX passes

- Companion: the 2 to 3 further UI passes Heph expects (Edit panels, Inbox, Campaign tab); onboarding for a first-time player who arrives by link.
- Atlas: PoI visibility per zoom; parent footprint shading; route and party arriving at a gate; party pennants.
- Scribe: a guided first campaign; readable errors from the update checker.
- All three: accessibility pass (contrast, tap targets, screen-reader labels), performance on a cheap Android phone, offline behaviour.

### Content readiness

- Beyond the Pale B2 complete for play in all three apps: sites, creatures (MM and OBX blocks side by side), handouts, rumours, encounter maps.
- **Rights check** on encounter maps traced from PDFs; anything unclear is redrawn or held back.

### Headless interface (0.7 or 0.8; agreed 2026-11-09)

- One headless layer in the shared engine that drives Companion, Atlas and Scribe without a screen, sliced by role (player, referee) exactly as the apps slice data.
- First uses: an automated run of the alpha walkthrough in CI; scripted or LLM playtesters for the private alpha; a cleaner base for the VTT bridges.
- It is the foundation for the post-1.0 plugins (Minion, Vizier, Minstrel); see `post-1.0-roadmap.md`.

### Format freeze prep (end of 0.7)

- A list of every format and its owner app; a JSON schema and a validator for each; a migration runner in the engine, unused until 0.9.0 but tested.

**0.7 exit test:** an outside person joins by link, plays a B2 session, and cannot read another player's knowledge from any file or link.

## 0.8.X Private alpha

**Goal:** real campaigns at real tables find the bugs we can't.

1. **Testers:** two or three tables recruited (Heph's own table first). **Decide D4.**
2. **Feedback channel,** free: GitHub issues with a template plus one Discord channel; a "Report a problem" link in each app that pre-fills the app version.
3. **Guides:** referee quick start, player quick start, "your first campaign in Scribe".
4. **Real-phone matrix:** Android Chrome, iPhone Safari, Chromebook, desktop Chrome and Firefox.
5. **Name and domain** settled before anything is printed or QR-coded (**Decide D3**): Hexmarch or Freemarch, custom domain on Pages, apps' URLs moved to a site config.
6. **Handoff to Content & Business** (GitHub `handoff:content` issue): launch timing, store pages, devlog, Patreon links in the apps.
7. From 0.8 on, format changes need a migration, because tester campaigns exist.

**0.8 exit test:** the tables finish several sessions; no open bug loses data; testers would keep playing.

## 0.9.0 Format lock

Freeze every format listed at the end of 0.7. After this, a format change is a new format version plus a migration (Heph, 2026-11-09). Specs in the data repo (STATE_FORMAT, ATLAS_FORMAT, EVENTS_FORMAT, CREATURES_FORMAT, ENCOUNTER_FORMAT, SCRIBE, WORKFLOWS, rules-modules, module format) move from draft to locked, each with its schema and validator in CI.

## 0.9.X Public beta

1. Public launch of the three apps (web/PWA only; no store listings until a trademark search is done).
2. **Scribe opened to outside authors** with the open-licence creator toolkit: module template, publishing guide, a validator they can run.
3. Rights audit before launch: no Mystara, ACKS or unclear traced maps on public URLs; licence and credit lines everywhere.
4. Monitoring with free tools only (GitHub Actions checks of the live site, issue triage).

## 1.0.0 Release & maintenance

- Stable releases with a deprecation policy (how long an old format version stays readable).
- Release routine for modules: the "one big hexcrawl a month" drumbeat from strategy.md.
- **Gutenberg** (Scribe's publisher module: releases, signing, QR codes, print PDFs) either here or after 1.0 (**Decide D5**).

## Parked for after 1.0 (unless Heph pulls them in)

Hexmap import into Scribe (see **Decide D6**), the Lapta hex editor, downtime procedures with Discord witness posts, the referee's phone as a remote, calendar RSVPs, sub-refs and West Marches, bundles and signatures, the full porting check, gTove export, `.e9vtt` drop, pearls with class and talents in the item format.

---

## Critical path

```
hexmarch- rename ─▶ Link adapter ─▶ hosting adapters ─▶ remote session (0.6 exit)
                         │
                         └─▶ device keys + seats ─▶ encryption ─▶ outside player (0.7 exit) ─▶ private alpha ─▶ format lock ─▶ public beta
procedures engine ─▶ Open/Close session ─┘                                    ▲
lockfile ─▶ update checker ─▶ Scribe steps 4-6 ───────────────────────────────┘
name + domain decision ─────────────────────────────────────────▶ before 0.8 printing/QR
```

The longest chain is links → keys → encryption. Everything else can run beside it.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| One person's bandwidth (Heph tests and words every rule) | Stages slip; burnout | Keep each stage's exit test small; let content and rules work wait without blocking app work |
| iPhone and Firefox lack share target and File System Access | The link and folder flow breaks for some players | Download/upload fallbacks designed in 0.6, tested on real phones in 0.7 |
| WebRTC without a TURN server fails on some networks | No live channel for some players | Link and polling fallback ships first and stays |
| Google changes the Drive download endpoint or Apps Script quotas | Hosting adapter breaks | Keep the Manual adapter and any static host working; the Test button catches it |
| GitHub Pages deploy race (legacy "pages build and deployment") | Atlas 404, Scribe blank | Pages Source stays on GitHub Actions; a CI smoke test of the live URLs |
| Format lock comes before formats are exercised | Locked mistakes, many migrations | Lock only after the private alpha has used every format |
| Rights (Hexmarch name, traced maps, WotC/Mystara, ACKS, OSE trademark) | Takedown or forced rename after launch | Name decision before 0.8; rights audit before 0.9; private modules never on Pages |
| Browser storage eviction | Lost campaign data | Campaign folder as the durable home (E4); storage only a cache |

## Decisions for Heph

- **D1. Default home for the referee's campaign folder:** a folder on the device (File System Access), a Drive folder, or a git repo. My suggestion: a device folder by default, with Drive as the shared option, since it costs nothing and works offline.
- **D2. Procedures engine and Open/Close session in 0.6 or 0.7?** My suggestion: 0.6, because the live channel and the Atlas's `sight-range` both run on it, and a remote session without session open and close isn't really remote play.
- **D3. Name:** Hexmarch or Freemarch, and the custom domain, before 0.8. A trademark search (USPTO/EUIPO) before 0.9 or any store listing.
- **D4. Private alpha:** how many tables and who (your own table plus one or two OSR Discord groups?).
- **D5. Gutenberg:** before 1.0 or after?
- **D6. Hexmap import:** it is parked after 1.0 above, but the "one hexcrawl a month" plan and Hansa as the creator-workflow test need it. Pull it into 0.7 or 0.8 if the monthly modules start before 1.0.
