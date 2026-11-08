# Licences

Everything made for the E9 app suite and its modules (code, specs, rules data, module text and maps, and the art drawn for them) is licensed by Heph under **Creative Commons Attribution 4.0 International (CC BY 4.0)** (https://creativecommons.org/licenses/by/4.0/). Use it, change it, fork it, self-host it and ship it, commercially or not, as long as you give credit, link the licence and say what you changed.

Suggested credit: "E9 / Materia Mundi by Heph (Bakagaijin Productions), CC BY 4.0".

| Part | Where | Licence |
| --- | --- | --- |
| E9 Companion app code | `companion-app/` (see [its LICENSE.md](companion-app/LICENSE.md) for the data files it carries) | CC BY 4.0 |
| E9 Atlas app and map tools | `modules/tools/` ([LICENSE.md](modules/tools/LICENSE.md)) | CC BY 4.0 |
| E9 Bridge for Foundry VTT | `vtt/foundry/e9-bridge/` | CC BY 4.0 |
| Build workflow and repo scripts | `.github/`, `mm.json`, `links.json` | CC BY 4.0 |
| Format specs | `modules/*.md`, `companion-app/*_FORMAT.md` | CC BY 4.0, so anyone can implement them |
| Rules data written for the Companion, including the Materia Mundi rulesets, equipment, magic and bestiary JSON | `companion-app/src/` ([LICENSE.md](companion-app/LICENSE.md)) | CC BY 4.0, except the third-party parts listed there |
| Modules: text, maps, encounter maps and data | `modules/<id>/` | CC BY 4.0 (each `module.json` says `CC-BY-4.0`) |

Heph's rule: anything AI-assisted that Bakagaijin Productions releases is always released under an open licence, CC BY 4.0. If he wants a private licence on something, he marks it by hand.

**Not covered by this CC BY 4.0 licence:**

- **The Materia Mundi books and their files** (the PDFs and Affinity `.af` files at the top of the repo, and `Art/`): © Heph, all rights reserved unless the book itself says otherwise.
- **Third-party rules material in the Companion data**: parts come from the E9 System Reference Handbook (CC BY-SA 4.0) and the System Reference Document 5.2 (CC BY 4.0), which require credit and, for CC BY-SA, share-alike. See [companion-app/LICENSE.md](companion-app/LICENSE.md).
- **Hex tile art** in `modules/assets/tiles`: C. Martins, CC BY-SA 4.0 (edited icons: "Art by C. Martins, edited by Heph", same licence).
- **Outside data a module uses**: the sources each `module.json` lists under `credits` (for example the Ireland castle dataset, CC BY 4.0), which keep their own licences.
- **Third-party libraries** the apps install (for example three.js): their own licences, as listed in `companion-app/package-lock.json`.
