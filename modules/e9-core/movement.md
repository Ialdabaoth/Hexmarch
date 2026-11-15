# E9 movement: scales and modes

Heph's design (2026-11-15), as data for the Atlas's procedures. It is the source for E9's `travel` and `move` procedures (EVENTS_FORMAT.md in the data repo). Heph will word it as game rules separately. The numbers live in `rules.json` under `movement` and `time`.

## One speed for every scale

1x is **5 paces a round**. The same walker covers:

| Scale | Step | 1x covers |
| --- | --- | --- |
| Encounter | 6-second round | 5 paces (25 ft) |
| Exploration | 10-minute turn | 5 furlongs (2,500 ft) |
| Investigation (an exploration mode) | 10-minute turn | 100 ft (0.04x) |
| Narration (overland) | any step the referee picks: hour, shift, day, week | 3 miles an hour |

Checked against the E9 System Reference Handbook: 5 paces a round (p. 33), half a mile a turn in daylight (pp. 22–23), a league an hour on a good road and a march a day in two 4-hour shifts (p. 20). All of these are 3 mi/h on a 5000-ft mile.

## Modes

| Mode | Talent | Speed | Only |
| --- | --- | --- | --- |
| (none) | no roll | 1x | |
| On Watch | Alertness | 1x | |
| Navigate | Survival | 1x | |
| Sneak | Stealth | 0.5x | |
| Climb/Swim/Maneuver | Agility | 0.5x | difficult terrain |
| Forced March | Agility | 2x | exploration and narration; road or clear terrain |
| Dash | Agility | 4x | encounter; road or clear terrain |
| Investigate | Alertness | 0.04x | exploration |
| Help | none | 1x | Experts: an ally gets one more mode |

## Rules

- **How many modes.** A non-Expert takes one mode at a time. An Expert takes 2 at level 1, 3 at level 5 and 4 at level 9. Help is an Expert mode and uses one of the Expert's slots (Heph 2026-11-15): the Expert helps an ally with a roll, and that ally may take one more mode than usual.
- **Several modes.** The slowest mode sets the character's speed. Extra modes add rolls but don't slow the character further.
- **The party.** The party moves at its slowest member's speed, or splits into separate parties (separate Atlas markers).
- **Difficult terrain** forces Climb/Swim/Maneuver on everyone crossing it, so 0.5x is the most anyone moves there. Forced March and Dash need a road or clear terrain.
- **No mode** means 1x and no roll.

## For the Atlas

- `travel` answers the time multiplier for a hex. Under E9 this is 1 for road or clear terrain and 2 for difficult terrain (Climb/Swim/Maneuver). A module's own terrain `travel` value still wins on its map.
- `move` takes the party's pace as a time multiplier, which is 1 / the party's speed. The party's speed is the slowest member's slowest mode.
- The Atlas needs each character's chosen modes per party, which it doesn't store yet (a `parties[].modes` field: `{character: [mode ids]}`). Without them, everyone moves at 1x.
- Rolls: each mode's talent check is rolled when its procedure runs (the navigator's Survival at the start of a shift, On Watch Alertness for an encounter, Agility for a Forced March). These come after this data, in their own PRs.

## Open

- Which Atlas terrain types count as difficult. Proposed: any whose travel multiplier is 2 or more, unless the module says otherwise.
