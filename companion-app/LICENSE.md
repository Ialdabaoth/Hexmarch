# E9 Companion: licence

The E9 Companion's **code** (everything in this folder that is source, build configuration or a script: `src/**/*.ts`, `src/**/*.svelte`, `src/**/*.css`, `scripts/`, `index.html`, `public/`, `src/rules/wiki-links.json`, and the config files) is licensed by Heph under **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/), the same as the E9 Atlas tools. Use it, change it, fork it and self-host it, as long as you credit it: "E9 / Materia Mundi by Heph (Bakagaijin Productions), CC BY 4.0". See the repository's [LICENSE.md](../LICENSE.md) for the whole suite.

**The rules data the app carries is CC BY 4.0 too**, except the third-party material in it, which keeps its source's licence:

| Files | Source | Licence |
| --- | --- | --- |
| `modules/e9-core/rules.json`, `modules/e9-core/equipment.json` (the E9 module) | E9 System Reference Handbook | CC BY-SA 4.0 (credit and share-alike) |
| `modules/mm-core/` (the MM module: `rules.json`, `equipment.json`, `bestiary.json`, and its E9 option `e9/rules.json`, `e9/equipment.json`) | The Materia Mundi Compendium, with material derived from the System Reference Document 5.2 by Wizards of the Coast LLC (CC BY 4.0) and E9 material (CC BY-SA 4.0) | The Materia Mundi data is CC BY 4.0; the SRD 5.2 and E9 parts keep CC BY 4.0 and CC BY-SA 4.0 |

The About screen in Settings carries the SRD 5.2, E9 and hex tile credits. A fork that ships these files must keep those credits.

The empty-file shapes of these formats (`CHARACTER_FORMAT.md`, `EQUIPMENT_FORMAT.md`) are CC BY 4.0, so anyone can write their own rules data for the app.
