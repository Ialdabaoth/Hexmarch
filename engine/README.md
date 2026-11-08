# E9 editing engine

One library behind **E9 Scribe**, and behind the small in-play edits in the E9 Companion and the E9 Atlas (PROPOSALS.md P3, "One editing engine"). The spec is `modules/SCRIBE.md` in the data repo. Plain TypeScript with no dependencies.

| File | What it does |
| --- | --- |
| `semver.ts` | Versions and npm-style ranges (`^0.1`, `~1.2`, `>=1 <2`, `||`), prereleases (`1.0.0-alpha` < `1.0.0-beta` < `1.0.0`), and `bump` (patch, minor or major, per WORKFLOWS.md). |
| `manifest.ts` | Reads the manifest fields the engine uses: `requires`, `recommends`, `conflicts`, `overrides`, `exclude`, `decisions`, `patches`, `starts`, rules `options`. Works for adventure modules, rules modules and campaigns. |
| `resolve.ts` | Resolves a module's dependencies to one version each (keeping locked versions while they fit), in dependency order. Reports missing modules, ranges nothing meets, declared conflicts, more than one root (P2), and cycles. There is no automatic solver: the referee decides. Writes the `e9-lock/1` lockfile with manifest hashes. |
| `content.ts` | Stitches the layers into one world. Declared overrides apply quietly, later layers winning. Undeclared clashes go to the referee, whose `decisions` pick a version (or `"house"`). `exclude` slices out ids and groups. Field `patches` carry a campaign's edits to another module, and a field the author has since changed is reported as stale. |
| `sites.ts` | Content ids for an adventure module's places (`<module>/site/<slug>`, the same slug as the module build). |
| `hash.ts` | Canonical JSON and SHA-256, for lockfile hashes and patches' `was`. |

Tests run with the Companion's (`cd companion-app && npm test`).
