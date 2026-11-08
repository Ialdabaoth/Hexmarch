# E9 Scribe: changelog

The E9 Scribe app (`scribe/`), the module and campaign editor. The version lives in `VERSION`; every merged PR that touches Scribe bumps the patch, each planned sprint bumps the minor. The spec is `modules/SCRIBE.md` in the data repo.

## 0.1.x (in development, now 0.1.0)

Sprint: the campaign view (pick a root, add modules, pick a start, settle conflicts, own content, parties and secrets, open in the apps) and the update checker.

- 0.1.0: Scribe exists at `<site>/scribe/` as its own installable app: a placeholder page, its own install manifest (`scribe/manifest.webmanifest`: name "⬢ Scribe", short name "Scribe", start and scope its own folder) and its icon (`icons/scribe.svg`). Built by `scribe/scribe_app.py` in the site workflow, after the Atlas.
