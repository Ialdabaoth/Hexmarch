# E9 core rules module (e9-core): changelog

The E9 rules as data, from the E9 System Reference Handbook (CC BY-SA 4.0). The version lives in `module.json`. Every merged PR bumps the patch; each sprint bumps the minor.

## 0.1.1

- The character sheet's layout moves here (`layout/`: `card-front.html`, `card-back.html`, `page-1.html`, `layout.css`; SHEET_LAYOUT.md in the data repo). It is today's E9 index card and full page, drawn the same; `module.json` names it with `"layout": "layout/"`. Materia Mundi and its E9 option use it too until mm-core ships its own.

## 0.1.0

- The E9 ruleset becomes its own module. `rules.json` (origins, classes, origin roll tables, mechanics; was the Companion's `src/rules/options/e9-options.json`) and `equipment.json` (E9 arms and armor; was `src/equipment/e9-equipment.json`) move here unchanged. The Companion still bundles them at build time.
