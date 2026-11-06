# E9 Bridge for Foundry VTT

Links Foundry VTT (v12 and v13) to the **E9 Atlas**. From one encounter map in the Atlas, the referee can build the scene in Foundry with its walls, doors and lights, place the creatures of its keyed scenes, and move the party's tokens to the entrance they came in by. It is the first adapter for the E9 VTT protocol `e9-vtt/1` (`modules/ENCOUNTER_FORMAT.md` section 14).

## Install

Until there is a release to install by manifest URL:

1. Copy this `e9-bridge` folder into Foundry's `Data/modules/` folder.
2. Restart Foundry, open your world, and turn on **E9 Bridge** in *Manage Modules*.

## Use

1. As GM, pick the **token controls** on the left toolbar and press the **map** button (*Open the E9 Atlas*). The Atlas opens in a new window, and Foundry shows a four-letter pairing code.
2. Check that the Atlas shows the same code at the bottom of its window ("Linked to Foundry · code ABCD").
3. In the Atlas, go to the place, open its encounter map, and press **Send to Foundry**. Choose which keyed scenes' creatures to place, which entrance the party arrives at, and whether to show the scene to the players, then **Send**.

The first time, the bridge saves the map picture in `Data/e9-maps/` and builds a scene marked with the map's id. Next time the same map reuses that scene and only places tokens.

## What it does in Foundry

| E9 | Foundry |
|---|---|
| map picture, 5-ft squares | scene background, square grid of the map's pixels per square, 5 ft |
| walls, doors (secret, locked) | walls; doors as door walls (secret doors, locked doors) |
| lights (fires) | ambient lights, dim radius = range, bright = half |
| creatures | tokens named after the creature, without actors for now (the E9 card is the stat block) |
| party | each player's assigned character: its token is moved to the entrance, or made there |

## Settings

- **E9 Atlas address**: the default is the public Atlas. Change it only if you host your own copy.
- **Folder for map pictures**: `e9-maps` inside the data folder.

## Safety

The bridge obeys only the Atlas window it opened, only from the Atlas's own web address, and only messages carrying this session's pairing code, and it runs commands only for a GM. It never sees or stores passwords.

Status: 0.1.0, tested against a stand-in for Foundry's API, not yet in a live Foundry world. Report what breaks.
