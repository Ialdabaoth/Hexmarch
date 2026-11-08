# E9 Companion: changelog

The version lives in `package.json` (see README "Versioning"). Every merged PR bumps the patch; each sprint bumps the minor.

## 0.5.0 (in development)

Sprint: git and VTT integration.

- 0.5.4: the licence is now CC BY 4.0 for the app code and its Materia Mundi rules data (it was CC0); credit "E9 / Materia Mundi by Heph (Bakagaijin Productions), CC BY 4.0". Third-party data licences are unchanged.
- 0.5.3: the app icon reads E9 instead of MM. The app's code is CC0 1.0, like the E9 Atlas tools (LICENSE.md here and at the repository root); its rules data keeps its sources' licences.
- 0.5.2: Campaign › Maps is the E9 Atlas itself (its own key, Route and Party tools) instead of the old module viewer; the party's place is kept from the Atlas's Party marker, and a party placed on the old 3-mile grid moves to the centre of its League. Manage › Modules › Open opens the Atlas.
- 0.5.1: the empty-maps hint names Beyond the Pale as The Isle of Mists, 1422.

### Queued for 0.5

From `strategy/mvp-checklist.md` (project files); MVP path decided by Heph 2026-11-07, referee writes and players read by link:
- Referee sign-in with a pasted GitHub token; create the campaign repo from a module; write the shared campaign state file (`partyAt` moves into it).
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
