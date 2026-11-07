# E9 Companion: changelog

The version lives in `package.json` (see README "Versioning"). Every merged PR bumps the patch; each sprint bumps the minor.

## 0.5.0 (in development)

Sprint: git and VTT integration. Version bump only so far.

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
