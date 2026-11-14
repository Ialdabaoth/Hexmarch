# Hexmarch post-1.0 roadmap

**Draft 1, 2026-11-09.** What comes after 1.0.0 (the MVP). The road to 1.0 is in [pre-1.0-roadmap.md](pre-1.0-roadmap.md).
Sources: `strategy/strategy.md` (grand plan, positioning, long-range lines, interlude toolkits), `strategy/handoffs/marketing.md`, WORKFLOWS (campaign play, sub-refs and West Marches, downtime), the MVP checklist's "After the MVP" lists, the 0.6 handoffs, and project memory (Scribe, rules modules, ACKS, OBX, Mystara, Hansa).

Everything below is a proposal built from ideas already on record. Items marked **Decide** need Heph. Sizes: **S** one small PR, **M** one or two PRs, **L** several PRs, **XL** a whole minor version.

## North stars (brainstorm, nothing committed)

Heph, 2026-11-09: "what-if pie-in-the-sky brainstorming rn, I just need some stars to steer by". So the rest of this doc is a sketch, not a plan; the "Decide" items are questions for some later day, not blockers.

1. **Any hexcrawl, playable tonight.** Drop in a scanned map or a PDF module you own, and Hexmarch turns it into a living atlas, a party on phones, and procedures that run the dice.
2. **The table you can watch.** Every roll, wound and discovery is a stream event; an actual-play group runs E9 with a pretty overlay and no setup.
3. **Bring your own rules.** E9, OBX, ACKS, 5E or a homebrew all run on one engine, and a campaign borrows ideas across them without breaking.
4. **A thousand authors.** Outside creators publish modules for free, and players find them from inside the apps; Heph's monthly hexcrawls are the backbone, not the whole shelf.
5. **The world keeps moving.** West Marches with sub-referees, downtime between sessions and regions that change while you're away: a campaign that lives between sessions, not only during them.
6. **Owned by nobody but the table.** No accounts, no servers, no fees: the campaign is a folder of files, it travels as links, and anyone can host their own copy.
7. **Any model, your choice.** Minion, Vizier and Minstrel speak to whatever LLM the user brings, hosted or local, and never lock the table to one vendor.

## The plugin apps (Heph, 2026-11-09)

If 1.0 works well, three plugin apps are designed after it. They sit beside Companion, Atlas and Scribe, talk to them by links like the others, and each serves more than one role.

| Plugin | For players | For referees | For creators | For podcasters and influencers |
|---|---|---|---|---|
| **Minion** | Henchmen: hirelings, retainers, followers | Creatures and NPCs | | |
| **Vizier** | | Running games | Designing and publishing | |
| **Minstrel** | | Recruitment for open games | | Podcasting, streaming, actual play |

How the tracks below map onto them:

- **Minion:** the retinue and followers now in the Companion, referee creatures, troupes, NPC templates, bestiaries, and the four creature parts (stats, gear, knowledge, flavour). Henchman morale, loyalty and upkeep would be procedures.
- **Vizier:** Track A on the creator side (Gutenberg publishing, editors, the dependency tooling, the module index) and Track C on the referee side (West Marches, sub-referees, downtime, calendar, the clock and region ratchets).
- **Minstrel:** Track B (overlay, stream view, game-event feed, chronicle to show notes, chat hooks), plus recruitment for open games: listing a West Marches or drop-in game, sign-ups, seat invitations.

Open questions (for later):

- **Q1.** Do Minion's creature and NPC tools and its henchmen move out of the Companion, or does Minion add to what the Companion keeps?
- **Q2.** Does Gutenberg (publishing) become part of Vizier, leaving Scribe as the editor? And does hexmap import stay in Scribe?
- **Q3.** Are the plugins separate installable apps (each its own PWA at `/vizier/`, `/minion/`, `/minstrel/`), or modules that switch on inside the existing apps?
- **Q4.** Name checks for all three before they're advertised.

## Design principles agreed (Heph, 2026-11-09)

- **Headless layer is platform, not plugin.** One headless interface in the shared engine, sliced per role (player, referee) and per app (Companion, Atlas, Scribe). It is built before 1.0 (see the pre-1.0 roadmap, 0.7.X/0.8.X), where it doubles as an automated test harness for the walkthrough, gives the private alpha LLM playtesters, and serves VTT bridges. The plugins add only the LLM-specific parts: the LLM adapter, translation layers, guidance and policy prompts.
- **Minion and Vizier split by who the agent is.** Anything with a sheet (player characters, henchmen, NPCs, monsters) is a Minion agent. The world and its rulings belong to Vizier. A Vizier co-referee hands an NPC's voice to a Minion seat instead of playing it itself.
- **Play-by-post first.** LLM seats start in asynchronous play (between sessions, downtime, West Marches, play-by-post games), where slowness and length don't hurt. Live-table LLM seats come after, with pacing rules.
- **One seat, one context window;** autonomy is a setting per seat.
- **Flags to settle before launch:** Minion and Minstrel look alike on a home screen (icons and short names must tell them apart); the "human-made" pitch needs a clear line on what an LLM may write and how it is labelled.

### LLM interfaces in all three plugins (Heph, 2026-11-09)

All three plugins will contain **platform-agnostic LLM interfaces**. A sketch of what that could mean, in keeping with the other rules:

- **One LLM adapter in the shared engine,** shaped like the hosting adapters: the user picks a provider, and the plugins never depend on one vendor. Likely adapters: any OpenAI-compatible endpoint (which covers many hosts and local servers such as Ollama or LM Studio), Anthropic, Google, and an in-browser model (WebLLM or similar) for a fully free, offline option.
- **Bring your own model and key.** Hexmarch runs no LLM server and pays for no tokens, which keeps the cost rule. Keys stay on the user's device.
- **Hexmarch as tools for any LLM client.** Expose the formats and actions (look up a creature, roll on a table, propose a knowledge entry, draft a request) as a tool interface, for example an MCP server or a plain JSON tool list, so a referee can also drive Hexmarch from the chat app they already use.
- **The LLM proposes, a person approves.** Output goes through the same request and approval flow as player changes, so nothing an LLM writes reaches the campaign, a module or a stream without a human yes.
- **Generated text is labelled** in the data (a `generated` flag with the model named), so a module or campaign can show what was human-written.

Example jobs per plugin:

- **Minion:** run a henchman's voice and morale; draft an NPC's stat block from a one-line idea; answer "what does this creature know?" from its knowledge entries only.
- **Vizier:** check a module for broken references and rules conflicts; suggest procedures and tables; help a referee prep the next session from the log.
- **Minstrel:** turn the session chronicle into show notes or a recap; draft a recruitment post for an open game; summarise the event feed for a stream.

Questions for later:

- **Q5.** "Human-made" is part of the pitch (strategy.md), and Heph writes all published prose. Is LLM help limited to each table's own private play and prep, with published modules staying human-written, or can creators publish LLM-assisted modules if they're labelled?
- **Q6.** Privacy: sending knowledge and secrets to a hosted model leaks them outside the table. Should secrets go only to local models, or need the referee's explicit opt-in each time?
- **Q7.** Is the tool interface (Hexmarch as tools for any LLM client) in scope, or only chat panels inside the plugins?

## What 1.x is for

Heph's grand plan (2026-11-05) is to become a go-to platform the way Shadowdark did: a strong core, a steady release drumbeat, then a third-party ecosystem. After 1.0 the apps therefore have three jobs:

1. **Let Heph ship one big hexcrawl module a month** without hand-building tools each time.
2. **Let other creators publish** modules that run in Hexmarch (this brings in their audiences, and it's the realistic way in without influencer reach).
3. **Make E9 fun to watch and stream** (the positioning hypothesis), and make the apps sticky for tables that already play.

Rules that carry over: free tools only; CC BY 4.0 for everything Claude helps make; private modules (ACKS, Mystara) never on public URLs; after 0.9.0 every format change is a new format version plus a migration; Heph writes the prose.

## Release shape

The suggestion is a minor release roughly every one to two months, each with **one headline track** and maintenance alongside. Patches (1.x.y) ship as needed. Each minor should give a module release or devlog something to point at (strategy.md: "every app sprint should ship something a release can point to").

| Release | Headline | Why in this order |
|---|---|---|
| 1.1 | **Creator kit I:** hexmap import + Gutenberg-lite | The monthly module drumbeat needs it first; Hansa is its test |
| 1.2 | **Streaming and actual-play kit** | Cheap to build, and the marketing hypothesis needs testing early |
| 1.3 | **Open the ecosystem:** module index, validator, author guide, bundles and signatures | Needs 1.1's tools proven on Heph's own modules first |
| 1.4 | **Campaign styles:** West Marches, sub-refs, downtime, calendar | Big, and specced already; worth it once more tables play |
| 1.5 | **More roots:** a second public system on a free licence | Depends on licences landing (OSE CC SRD "early 2027") |
| 1.6+ | VTT and export depth, Lapta strata editor, native store listings, translations | As demand shows up |

**Decide P1:** this order. The main alternative is streaming kit first (1.1), since it costs least and the hypothesis is unproven; and if the monthly modules start before 1.0 (pre-1.0 roadmap **D6**), hexmap import has already moved earlier and 1.1 becomes Gutenberg alone.

---

## Track A: Creator platform (Scribe and Vizier)

**A1. Hexmap import** (**L**), Scribe's agreed first job (Heph 2026-11-07). Import a scanned hexmap (own or permitted maps only), calibrate the grid with a few clicks, classify each hex's terrain with a review step, fill the finer levels procedurally, and write the module's map pictures. Rivers, roads and labels come later. Research is in `scribe/import-formats.md`. Pitch: "bring your existing hexcrawl into Atlas and Companion".

**A2. Gutenberg, the publisher module** (**L**). Releases with semver and change notes, signing, a QR code that loads the module into the apps, and a print hand-off: content and assets prepared for Affinity Publisher (Heph lays out), not finished layout. **Decide P2:** "Gutenberg" is a working name; check for conflicts.

**A3. Editors** (**L**, staged). Procedure and table editors (d20/d6 tables only, per house rule); a creature editor that keeps the four parts (stats, gear, knowledge, flavour); a site and PoI editor on the Atlas map.

**A4. Lapta and strata editor** (**L**). Hex-by-hex editing of floating maps on a time track (the Atlas owns the strata format). Built for Hansa, but generic.

**A5. Full dependency tooling** (**M**). Deferred from the MVP: conflict review, per-id update review, the full porting check ("made under different rules" becomes a field-by-field report), bundles and signatures.

**A6. Module index and discovery** (**M**). A free, static index (a JSON file in a public repo, built by GitHub Actions) that lists modules by URL. Authors submit by pull request; the apps can search it. No server, no fees. A validator authors run locally or in their own CI.

**A7. Author guide** (**S**, then kept current). Builds on `modules/BUILDING_A_MODULE.md`: a fixed module template (map scale, site count, table set, page budget) so "huge" is repeatable monthly.

**Exit test:** an outside author with an existing hexmap publishes a module that a stranger's table plays in Hexmarch, without asking us anything.

## Track B: Streaming and actual-play kit (Minstrel)

From strategy.md's podcaster toolkit (Heph 2026-11-05) and the positioning hypothesis.

1. **Stream overlay page** for OBS or any streaming app: a browser source showing party HP, rolls and the map. (**M**)
2. **Chrome-less stream view** of the character sheet and postcard. (**S**)
3. **One named game-event feed** (nat 20, damage, level up, death, discovery) that OBS, VTube Studio, Streamer.bot and Discord can all map, so vtuber players get stream events without us rigging avatars. (**M**)
4. **Session chronicle to show notes:** the events log becomes a readable recap a podcaster can post. (**S**)
5. Later: platform chat hooks (Twitch first). (**M**)
6. A short "stream E9" page with the explicit permission to stream and monetise actual play (Content & Business writes it; Tools links it from the apps).

**Exit test:** one of the 2 to 3 small streamers or actual-play groups Content approaches runs a session using the overlay with no help.

## Track C: Campaign styles (Vizier)

Already specced in WORKFLOWS (PRs #127, #128) and deferred from the MVP.

1. **Sub-referees and West Marches** (**XL**). The head referee hands out temporary sub-referee duties by region, session or both, recursively. Sub-referees write session branches that the head referee merges (automatically when trusted and conflict-free). Per-session parties, a shared player-visible map layer, scoped secrets. The game-time model is a procedure. The head referee settles cross-session conflicts.
2. **Downtime between sessions** (**M**). Downtime actions are procedures each game defines; rolls are posted through a Discord webhook as a witness and approved by the referee later.
3. **Calendar and RSVPs** (**M**) for "verify who's coming".
4. **The referee's phone as a remote** for the laptop (**M**).
5. **Clock and region ratchets** (**M**): d20 ratchets that keep other regions moving while the party is away.

## Track D: More rules roots

A campaign picks one root (Heph 2026-11-08). More roots widen who can use the apps.

| Root | Status | Route after 1.0 |
|---|---|---|
| E9 (`e9-core`), MM (`mm-core`) | In the MVP | Revised-edition errata as Content releases them |
| OBX (`obx-core`) | Numbers and tables only; OGL 1.0a | Move to the CC OSE SRD when it lands ("early 2027") after reading its exact licence; then rules text can be copied with credit |
| ACKS (`acks-core`) | Private, by permission from Alexander Macris | Finish and hand to Alex; Autarch decides licensing. Never public unless Autarch says so |
| 5E (SRD 5.2, CC BY) | Not started | A public root is possible under CC BY. **Decide P3** whether it's worth it |
| Shadowdark, LotFP, others | Not started | Only with a licence that allows it (Shadowdark has its own third-party licence; check terms) |

**Decide P3:** which second public root, if any. The Shadowdark audience is where much indie OSR money is (strategy.md), but its licence terms need checking first. OBX on the CC SRD is the cheapest route.

## Track E: VTT and export

1. Owlbear Rodeo extension and Foundry bridge polish (if not done in 0.6/0.7). (**M**)
2. gTove export, `.e9vtt` drop, "Run encounter" links into VTTs (ENCOUNTER_FORMAT §13). (**M**)
3. MegaMek board export and an Inner Sphere map: fan use only, non-commercial, clearly fan-made (BattleTech belongs to Catalyst), no Patreon tier. Stretch, after Hansa. (**M**)

## Track F: Content drumbeat (module conversion)

Converting Content's books into modules stays in this project; Content owns the writing and is the source when the two disagree.

- **Beyond the Pale series:** B3 Kyteler palace (Kilkenny), then B4 deep Faerie (Kildare) and B5 (Carlow) once Heph writes them. Each goes through all five phases (design, Companion, Atlas, print, release).
- **Hansa first** as the test of the 1.1 creator tools, then **one big hexcrawl a month for about six months**: Byzantos, Hiberas, Vlacha, Agartha (zine line, generator procedures), Francia, Barsoom. Order not fixed. **Decide P4:** order, and whether a slipped month waits or ships smaller (strategy.md warns that a month that slips beats a month that ships half-done).
- **Mystara** stays a private playtest module, gifted to the fan mapmaker afterwards.
- **Patreon tie-in:** each month's module feeds the tiers in strategy.md. App links to Patreon (Brand setup list).

## Track G: Maintenance and reach

1. **Support policy** (**S**): how long an old format version stays readable; how fast data-loss bugs get a patch.
2. **Migrations** for every format version (the runner exists from 0.9.0).
3. **Translations of the app UI** (**M** per language). Place names are already in Irish and English; Hansa adds German, Polish and Old Prussian. **Decide P5:** whether UI translation is wanted, and which language first.
4. **Store listings** (**M**). A Trusted Web Activity on Google Play costs a one-off developer fee, so it conflicts with the cost rule; it also needs the trademark search first (Google Play already has a game called Hexmarch). Recommendation: stay web-only unless the name is settled and Heph accepts the fee.
5. **Accessibility, performance and security reviews** each minor (**S** each).
6. **Self-hosting:** all hard-coded URLs live in the site config, so anyone can host their own copy (licence already allows it).

## Dependencies

- Track A (creator tools) before Track F's monthly drumbeat, unless the drumbeat starts earlier (see pre-1.0 **D6**).
- A1 + A2 proven on Heph's own modules before A6 opens the ecosystem.
- Track B needs only the events log and the live channel from 0.6, so it can start any time after 1.0, or be pulled in earlier if Content's streamer test needs it.
- Track C needs multi-party state (0.7) and device keys (0.7).
- Track D's OBX move depends on Necrotic Gnome's CC SRD; ACKS depends on Heph's private repo and PDF.

## Risks

| Risk | Mitigation |
|---|---|
| Platform work starves the books (strategy.md) | One headline track per minor; every minor gives a release something to point at |
| Monthly modules burn Heph out | Fixed module template; a slipped month ships late, not half-done |
| Few outside authors turn up | Open the ecosystem only after Heph's own modules prove the tools; pitch "write an adventure, get a free atlas and character app" |
| Licences for other roots change or forbid use | Read every licence before copying; private modules for anything unclear |
| A second root strains the E9-shaped engine (rules.ts, creature.ts) | Roots go through derive.json and layouts, as OBX does |
| Maintenance grows with every format version | Deprecation policy in 1.0; migrations tested in CI |

## Decisions for Heph

- **P1.** Release order (creator kit first, or streaming kit first?).
- **P2.** Name check for "Scribe" and "Gutenberg" before they're advertised.
- **P3.** Which second public root, if any (OBX on the CC SRD, 5E SRD 5.2, Shadowdark if its licence allows).
- **P4.** Order of the monthly hexcrawl modules after Hansa.
- **P5.** App UI translations: wanted, and which language first?
- **P6.** Store listings: stay web-only, or pay the Play Store fee once the name is settled?
