# Hexmarch editing engine

One library behind **Hexmarch Scribe**, and behind the small in-play edits in the Hexmarch Companion and the Hexmarch Atlas (PROPOSALS.md P3, "One editing engine"). The spec is `modules/SCRIBE.md` in the data repo. Plain TypeScript with no dependencies.

| File | What it does |
| --- | --- |
| `semver.ts` | Versions and npm-style ranges (`^0.1`, `~1.2`, `>=1 <2`, `||`), prereleases (`1.0.0-alpha` < `1.0.0-beta` < `1.0.0`), and `bump` (patch, minor or major, per WORKFLOWS.md). |
| `manifest.ts` | Reads the manifest fields the engine uses: `requires`, `recommends`, `conflicts`, `overrides`, `exclude`, `decisions`, `patches`, `starts`, rules `options`. Works for adventure modules, rules modules and campaigns. |
| `resolve.ts` | Resolves a module's dependencies to one version each (keeping locked versions while they fit), in dependency order. Reports missing modules, ranges nothing meets, declared conflicts, more than one root (P2), and cycles. There is no automatic solver: the referee decides. Writes the `hexmarch-lock/1` lockfile with manifest hashes. |
| `content.ts` | Stitches the layers into one world. Declared overrides apply quietly, later layers winning. Undeclared clashes go to the referee, whose `decisions` pick a version (or `"house"`). `exclude` slices out ids and groups. Field `patches` carry a campaign's edits to another module, and a field the author has since changed is reported as stale. |
| `sites.ts` | Content ids for an adventure module's places (`<module>/site/<slug>`, the same slug as the module build). |
| `mail.ts` | The `hexmarch-mail/1` envelope every request travels in (WORKFLOWS.md "One envelope"): `join` (a player's character asking to join) and `sent-back` (the referee's note). Where a request stands (Sent, Received, Live, Sent back) comes from the next snapshot's `receipts` and party list. |
| `adapters.ts` | Store adapters for Publish: the referee's own Apps Script (Google Drive, script text included), their own GitHub repo (Contents API, read back from raw.githubusercontent.com), or Manual (download and upload by hand). The token or key lives on the referee's device under `publish-secret:<id>`, never in the campaign record. |
| `hash.ts` | Canonical JSON and SHA-256, for lockfile hashes and patches' `was`. |

Tests run with the Companion's (`cd companion-app && npm test`).
