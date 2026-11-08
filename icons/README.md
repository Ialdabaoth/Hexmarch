# App icons

One look for every app: a dark rounded square (`#2b2118`) with the gold hexagon (`#e8c77a`).

| App | Icon | Inside the hexagon |
| --- | --- | --- |
| Companion | `companion.svg` | the die (the triangle face) |
| Atlas | `atlas.svg` | a forest hex |
| Scribe | `scribe.svg` | the die with a quill pen over it |

`png/` holds 512, 192 and 180 px renders (180 is the Apple touch icon). The Companion's copies are in `companion-app/public/`; `modules/tools/atlas_app.py` copies the Atlas's into `<site>/atlas/`. Re-render the PNGs after editing an SVG.
