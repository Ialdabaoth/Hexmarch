# App icons

One look for every app: a dark rounded square (`#2b2118`) with the gold hexagon (`#e8c77a`).

| App | Icon | Inside the hexagon |
| --- | --- | --- |
| Companion | `companion.svg` | the die (the triangle face) |
| Launcher | `launcher.svg` | the die (the triangle face): the Companion's icon until 2026-11-10, now the Launcher's (Heph); the Companion gets this icon with a picture over it |
| Atlas | `atlas.svg` | a heavy woods hex (the map's own forest tile) |
| Scribe | `scribe.svg` | 📜 with 🪶 over it (Twemoji) |

`png/` holds 512, 192 and 180 px renders (180 is the Apple touch icon). The Companion's copies are in `companion-app/public/`; `modules/tools/atlas_app.py` copies the Atlas's into `<site>/atlas/`. Re-render the PNGs after editing an SVG.

**Atlas icon credit:** its heavy woods tree clump and green ground are the Hexmarch Atlas map tiles `forest.png` and `bg-green.png` from **Hex Tiles: Fantasy** by C. Martins (https://cmartins.itch.io/hex-tiles-fantasy), CC BY-SA 4.0, so `atlas.svg` and its PNGs are CC BY-SA 4.0. The other icons are CC BY 4.0.

**Scribe icon credit:** the scroll and feather are Twemoji 📜 (U+1F4DC) and 🪶 (U+1FAB6), Copyright Twitter, Inc and other contributors, CC BY 4.0 (https://github.com/jdecked/twemoji).
