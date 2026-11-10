# Hexmarch apps

The Hexmarch apps, for OSR hexcrawl games under any core rules: the **Hexmarch Companion** (`companion-app/`), the **Hexmarch Atlas** and the module build tools (`modules/tools/`), and **Hexmarch Scribe** (`scribe/`, the module and campaign editor, published at `/scribe/`). `engine/` is the editing engine they share. `modules/e9-core/` is the E9 rules module, kept here as the example root module. `vtt/` holds the Foundry bridge and the Materia Mundi Roll20 sheet.

All setting data (Materia Mundi rules in mm-core, the adventure modules, the format specs, `hexmarch.json`, `links.json`) lives in the data repo named in [`site.json`](site.json), [Ialdabaoth/MateriaMundiRPG](https://github.com/Ialdabaoth/MateriaMundiRPG). The apps load modules from its site by link.

## Build

```sh
scripts/data.sh            # copies mm-core and links.json from the data repo (git-ignored)
(cd companion-app && npm ci && npm test && OUT_DIR=../_site/companion npm run build)
python3 -I modules/tools/atlas_app.py _site
(cd scribe && npm ci && npm run build && python3 -I scribe_app.py ../_site)
python3 -I launcher/launcher.py _site
```

The site (`_site/`) is the **Launcher** at its root (`launcher/`: the apps, the campaigns on this device, backup and reset of what the apps keep in the browser) with the apps beside it: `companion/`, `atlas/`, `scribe/`. Each installs as its own app. A link for another app opens in that app, never inside the current one (`engine/handoff.ts`).

The data repo builds its module pages with `modules/tools/build.py` from this repo.

## Licence

CC BY 4.0, credit "E9 / Materia Mundi by Heph (Bakagaijin Productions), CC BY 4.0". Third-party parts keep their own licences (see `companion-app/LICENSE.md`, `modules/tools/LICENSE.md`).
