# Hexmarch Companion: changelog

The released version lives in `package.json` (see README "Versioning"). Every merged PR is one patch; each sprint bumps the minor. New entries are not written here by hand: each PR adds a change note in `changes/`, and the site build numbers the notes in the order they merged and lists them here (CONTRIBUTING.md "Versions and change notes").

## 0.6.0 (in development)

Sprint: integration (the free tools that carry remote play). 0.6.0 opens it.

<!-- changes.py: new entries go below this line -->

## 0.5.35 (2026-11-09), 0.5.x closed: the alpha round trip

0.5.X took the Companion from a character keeper to one end of a shared campaign, and ended with the alpha walkthrough working end to end (Scribe creates and publishes, the referee invites, a player joins and rolls, the referee approves, the player explores the map as their character).

- **Campaigns from Scribe and published campaigns**: a Scribe campaign opens in the Companion (by its link, and now by an `#m=` message link from any browser), and a published campaign opens from its pointer and snapshot.
- **Player and referee modes**: one Settings › Campaign entry per invitation; player mode sees the player's character, the party and that character's knowledge, referee mode everything.
- **Invitations**: the referee's invitation link adds the campaign in player mode, optionally for a given character; an out-of-date app updates itself first.
- **Join requests and the Inbox**: a player sends their character (POST or file), the referee approves or sends it back, and the player follows where it stands.
- **Update campaign**: the referee republishes `campaign.json` and `snapshot.json` with the clock, party, each character's knowledge and the answered requests, with or without Scribe's record on the device; Send play to Scribe hands the same to Scribe.
- **Maps and fog**: knowledge from the Atlas's fog of war is kept on the characters, and module lists refresh so maps appear.
- Also: sheet layouts from the ruleset module, the carry box and folding Edit panels, window titles, and the rename to Hexmarch Companion.

Sprint 0.5 began as git and VTT integration.

- 0.5.35: Housekeeping for 0.6.0: the party's place from before 0.5.5 (kept in the settings) and party places on the pre-0.5.2 3-mile grid are no longer read, since only the developers use the app before 0.8.X; a state file's party must be on the Atlas grid. The README describes campaigns, seats, the Inbox, Update campaign, links with Scribe and Maps.
- 0.5.34: Saved modules are read again from their sites each time the app opens, and a campaign always brings its own modules' site, so a module list saved by an older install no longer hides a module's Atlas map ("has no Atlas map"). A site that can't be read keeps its saved copy. Campaign › Maps opens on the party's module, or else the first module with a map.
- 0.5.33: Renamed to the Hexmarch Companion, since the apps run any OSR hexcrawl core rules. The name comes from the site's name, so it shows in Settings › About, as the Discord poster when a roll has no name, and in the sheet's footer.
- 0.5.32: Update campaign also works on a device that doesn't hold Scribe's record of the campaign (Scribe ran in another browser or profile): opened as referee by its published link, the campaign rebuilds the record from its pointer and last snapshot. The Inbox says which campaign id it looked for when it can't offer Update campaign.
- 0.5.31: Scribe and the Companion talk by links: Scribe's "Open in the Companion" link opens the campaign in referee mode on any device or browser, and "Send play to Scribe" in Settings opens Scribe with the clock, the party, what each character knows and the requests you answered. Opening the same link twice changes nothing.
- 0.5.30: Update campaign keeps the two files it built on the device (`published:<id>`), as Scribe's Publish does, so Scribe's Test checks the uploaded folder against the latest update rather than an older publish.
- 0.5.29: Update campaign is offered whenever this device holds Scribe's published record of the campaign in use, whichever seat or link opened it; a referee opening their own campaign by its published link runs it from Scribe's copy.
- 0.5.28: Tapping an invitation on a device with an old copy of the app no longer ends at "That link isn't a Materia Mundi campaign file". A campaign file in a format the app doesn't know says "This campaign needs a newer Companion. Updating…", fetches the new version and opens the invitation again after reloading. When a new version takes over just after the app opens, or while an invitation waits, the page reloads into it.
- 0.5.27: The referee's Inbox shows "1 answer not yet sent to players" with an Update campaign button whenever an approval or a sent-back note hasn't been published yet; each request says whether its answer has reached the player.
- 0.5.26: Update campaign builds its snapshot the same way Scribe's Publish does (engine publishParts, #27): state, each party member's knowledge and the answered requests are read from storage after saving, so publishing from either app gives the same snapshot.
- 0.5.25: The alpha round trip works between two devices. A player sends their character to the referee from the home screen: by the campaign's post URL when it has one, otherwise as a file. The referee opens it in the Inbox and approves it or sends it back with a note. Settings › Update campaign then saves the campaign pointer and a new snapshot for upload, carrying the state, each character's knowledge and the answered requests. A player's Check for changes takes the new party list and their own character's knowledge, and the Inbox follows the request from Sent to Received to Approved.
- 0.5.24: A player's invitation to a published campaign opens: the Companion reads the campaign pointer (campaign.json) the link names, then the snapshot it points to, and takes the shared state (clock, party, what everyone knows) from it. The referee's Invite a player opens once Scribe has published the campaign, and the link names the pointer.
- 0.5.23: Edit view panels start folded, and the ones you open stay open next time on this device. Opening the Edit view at a section, such as from the card's Carry box, opens that panel. Only the Carry load sits in the box now, with the encumbrance note in parentheses beside it.
- 0.5.22: The window title follows the campaign in use, as the switcher names it: "Kells 1422 · Playing Holly", "Kells 1422 · Referee", or "My Characters" outside a campaign (it read "E9 Companion"; Heph 2026-11-09).
- 0.5.21: The Carry load in Status sits in a box like the other Status values.
- 0.5.20: The character's **Full sheet** and **PDF** buttons are now **Edit** and **Print**, so the editor isn't mistaken for the letter-size printout; inside it, **Postcard / PDF** and **Full page** are **Print card** and **Print page** (Heph 2026-11-09). Each panel of the Edit view folds away, and the device remembers which are folded. The panels run Status (HP, armor, carry and Effects), Abilities and saves, Attacks, Talents, Magic, Class features (with XP), Gear (with magic items and notes) and Retinue.
- 0.5.19: Settings › Invite a player waits until the campaign is published: a campaign Scribe saved on this device can't be opened by anyone else, so it says so instead of offering a link (data repo WORKFLOWS.md "Invitations, modes and who writes what", Heph 2026-11-09).
- 0.5.18: The campaign switcher names a new player invitation "Kells 1422 · (Roll a character)" until the player picks or makes one, then "Kells 1422 · Playing Holly"; a referee invitation reads "Kells 1422 · Referee" (Heph 2026-11-09).
- 0.5.17: Player mode and referee mode (Heph 2026-11-09). The campaign switcher (Settings › Campaign) lists every invitation on this device, Referee or Player, so the same campaign shows once for each invitation, and picking one sets the mode. Referee mode is the Companion as it was. Player mode shows your own character and their followers (no switching characters). Campaign › Your party lists the rest of your party from the shared state file, and the NPCs your character has met or heard of. The state is read-only. Creatures, referee maps, Art and Manage are hidden. Campaign › Maps opens the Atlas locked to your character's knowledge. Invitations are kept under `invitations` on the device (`src/lib/invitations.ts`). A player's invitation is a link, `?campaign=<link>&as=player&character=<id>`, copied from Settings › Invite a player or pasted into Add a campaign. Campaigns opened before this become referee invitations. Knowledge entries gain `creature` and `name` (CHARACTER_FORMAT.md "Knowledge"): met, or heard of with `"rumour": true`, as for hexes. Each creature in Campaign › Creatures has **The party met them** and **The party heard of them**.
- 0.5.16: knowledge entries may say `"explored": true` or `"rumour": true` (the Atlas's fog of war, Atlas 0.5.17). Campaign › Maps keeps what the Atlas reports (each hex in sight along a party move, and the referee's fog brush) on the named characters' sheets, and when the app comes back into view it takes knowledge the Atlas wrote on this device while open on its own.
- 0.5.15: opens a campaign made in E9 Scribe. Scribe saves the campaign on this device, and its "Open in the Companion" link (`?campaign=scribe:<id>`) makes it the campaign in use: its name, the ruleset its root provides, that ruleset's own equipment, the first state file Scribe wrote (clock, start, places known), and the modules' site added to Modules for Campaign › Maps. Nothing is fetched for the campaign itself. It shows under Settings › Campaign with the others. (0.5.14 is the Atlas fog PR, #15.)
- 0.5.13: the index card and the full page are drawn from the ruleset's module layout (SHEET_LAYOUT.md in the data repo; e9-core 0.1.1 ships today's card and page, so nothing changes on screen). The Companion keeps the surfaces (the 5×3 card's two faces, the letter page), the dice, the editors and print; a layout is checked on load against a whitelist of elements and CSS, and can only place values, roll buttons and taps. Engine: `src/lib/layout/` (parser, CSS scoping, named values, the sheet's d.* values) and `components/layout/LayoutNodes.svelte`.
- 0.5.12: Campaign › Maps sends the Atlas each character's name and `knowledge` entries, on opening and after every change, for the Atlas's character mode (Party › Show the map as). It also sends everything again once the Atlas has finished loading its map, so nothing is lost while it loads.
- 0.5.11: Campaign › Maps sends the Atlas the whole campaign state file, on opening and after every change, so the Atlas shows the clock, the session and what the party has found. When the Companion's tab comes back into view it reads the state file again if it is newer, which picks up party moves made in a separate Atlas tab.
- 0.5.10: a character is saved in four parts, stats, gear, knowledge, and flavor (name, portrait, notes), each exported and loaded on its own (CHARACTER_FORMAT.md, sheet version 4; Heph 2026-11-08). The sheet's Manage section has Export one part only and Load a part; a part replaces only that part of the character with the same id. Sheets gain dated `knowledge` entries. Older sheets still import.
- 0.5.9: the installed app is named "⬢ Companion" (short name "Companion"), matching "⬢ Atlas" and "⬢ Scribe" (Heph 2026-11-08).
- 0.5.8: the Atlas address typed without its trailing slash (`/Hexmarch/atlas`) opened the Companion once the Companion had been loaded on that device: its offline copy answered for any page it did not recognise. It now leaves `atlas`, `modules` and `scribe` alone with or without the slash, so the server forwards to `atlas/`.
- 0.5.7: the apps moved to their own repository, and each app has its own icon (Heph 2026-11-08). The Companion's icon is now just the die, without "E9"; the Atlas's is the map's heavy woods hex and Scribe's 📜 with 🪶 (Twemoji, CC BY 4.0) (`icons/`). The Companion opens the Atlas that ships beside it and passes the module's site, and its home module repository comes from `site.json`.
- 0.5.6: the campaign state file (`modules/STATE_FORMAT.md`). Campaign › State shows the game clock (+1 hour, +8 hours, +1 day, start date), where the party stands, the session (Start and End), what the party has found and which core rules module the campaign plays with, and saves or loads the file as `state.json`. Each campaign has its own; the party's place moved there from the settings, and Atlas travel time passes on the clock.
- 0.5.5: E9's rules and arms and armor now come from the E9 module (`modules/e9-core/rules.json`, `modules/e9-core/equipment.json`, module 0.1.0). Nothing changes on screen.
- 0.5.4: the licence is now CC BY 4.0 for the app code and its Materia Mundi rules data (it was CC0); credit "E9 / Materia Mundi by Heph (Bakagaijin Productions), CC BY 4.0". Third-party data licences are unchanged.
- 0.5.3: the app icon reads E9 instead of MM. The app's code is CC0 1.0, like the E9 Atlas tools (LICENSE.md here and at the repository root); its rules data keeps its sources' licences.
- 0.5.2: Campaign › Maps is the E9 Atlas itself (its own key, Route and Party tools) instead of the old module viewer; the party's place is kept from the Atlas's Party marker, and a party placed on the old 3-mile grid moves to the centre of its League. Manage › Modules › Open opens the Atlas.
- 0.5.1: the empty-maps hint names Beyond the Pale as The Isle of Mists, 1422.

### Queued for 0.5

From `strategy/mvp-checklist.md` (project files); MVP path decided by Heph 2026-11-07, referee writes and players read by link:
- Referee sign-in with a pasted GitHub token; create the campaign repo from a module; commit the campaign state file as `campaign/state.json`.
- Rules from modules at run time: the core rules modules (e9-core, mm-core and its e9 option) are compiled in for now; a campaign should be able to load a rules module by its address instead.
- Join by invite link or QR, pick or roll a character, send it to the referee.
- Referee Inbox: character requests shown in place, Approve or Send back.
- Player mode: hide Creatures, module stat blocks and referee maps.
- End session: one commit with a session tag for log, party state and changed characters.
- Events log buttons (first slice of EVENTS_FORMAT.md).
- Run encounter: Send to Foundry and "Open in VTT" scene links, shared with the Atlas (ENCOUNTER_FORMAT.md sections 13–14).
- Equipment format: pearls with a class and talents.
- Check the Discord webhook from a real device.

## 0.4.13 (2026-11-06), 0.4.x closed

- 0.4.13: Patreon link turned on.
- 0.4.12: map controls below the map; key pane drawn like the Atlas side panel.
- 0.4.11: `/atlas/` passes through the offline cache.
- 0.4.10: Atlas embedded from `/atlas/`.
- 0.4.9: Pale Keep creatures loaded from the module.
- 0.4.8: Patreon link in the About card.
- 0.4.7: NPC templates and joining the party.
- 0.4.6: creature templates and referee creature cards.
- 0.4.5: renamed to E9 Companion.
- 0.4.4: module moved to `modules/isle-of-mists`.
- 0.4.3: Panoply as a collapsible tree.
- 0.4.2: page references across the app open the SRD wiki.
- 0.4.1: Rules page references open the SRD wiki.
- 0.4.0: envelope Inbox, dice rest in the result, Rules picker in Settings, Campaign › Art.

## Earlier

0.2.x–0.3.x: character builder, equipment, bestiary, referee maps, module repositories (`mm-module/1`). See the git history.
