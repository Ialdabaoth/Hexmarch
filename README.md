# E9 apps

The E9 apps: the **E9 Companion** (`companion-app/`), the **E9 Atlas** and the module build tools (`modules/tools/`), and **E9 Scribe** when it lands. `modules/e9-core/` is the E9 rules module, kept here as the example root module. `vtt/` holds the Foundry bridge and the Materia Mundi Roll20 sheet.

All setting data (Materia Mundi rules in mm-core, the adventure modules, the format specs, `mm.json`, `links.json`) lives in the data repo named in [`site.json`](site.json), [Ialdabaoth/MateriaMundiRPG](https://github.com/Ialdabaoth/MateriaMundiRPG). The apps load modules from its site by link.

## Build

```sh
scripts/data.sh            # copies mm-core and links.json from the data repo (git-ignored)
cd companion-app && npm ci && npm test && npm run build
python3 -I modules/tools/atlas_app.py companion-app/dist
```

The data repo builds its module pages with `modules/tools/build.py` from this repo.

## Licence

CC BY 4.0, credit "E9 / Materia Mundi by Heph (Bakagaijin Productions), CC BY 4.0". Third-party parts keep their own licences (see `companion-app/LICENSE.md`, `modules/tools/LICENSE.md`).
