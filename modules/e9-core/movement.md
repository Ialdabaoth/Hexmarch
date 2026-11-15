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
- **Terrain** is graded, not multiplied (Heph 2026-11-15). Each hex has five traits on the handbook's difficulty steps (automatic, easy, normal, hard, impossible): orient, traverse, hide, investigate and view (ATLAS_FORMAT.md in the data repo, "Terrain traits"). E9's defaults by terrain id are in `rules.json` `terrain`; a module's terrain type, a single hex and the campaign can override them. Traverse sets the speed: automatic, easy and normal are 1x (easy and normal ask for an Agility roll at that difficulty), hard forces Climb/Swim/Maneuver (0.5x), impossible stops travel on foot. Forced March and Dash need automatic traverse (a road or grassland). Every road is 1x (Heph 2026-11-15); road quality makes the Forced March roll easier instead: easy on a Roman or local road, normal on a trail or off the road (`movement.roads`). Navigate rolls Survival at the orient grade, Sneak rolls Stealth at the hide grade, Investigate rolls Alertness at the investigate grade, and the view grade sets how far one sees.
- **No mode** means 1x and no roll.

## For the Atlas

- The Atlas works out each hex's traits (ruleset default, then the module's terrain type, then `hex_traits` per hex, then the campaign; a road makes orient and traverse automatic) and the party's `speed` from `movement`: each member's slowest applicable mode, with `movement.traverse[grade].requires` forcing a mode on everyone and `speed: 0` stopping the walk before that hex.
- `move` gets `mi`, `mph`, `speed`, `modes` and the five traits, and passes {mi} ÷ (mph × speed) hours. It rolls nothing, so the Atlas can dry-run it for the key, the Route estimate and the Navigate preview.
- `sight-range` answers miles by the hex's `view` grade (`movement.view_mi`).
- `travel` is retired and answers 1 until the Atlas stops asking.
- Rolls (Survival at the orient grade each shift, Agility at the traverse grade, Stealth at the hide grade, On Watch Alertness for an encounter) are their own procedures, added in later PRs.
