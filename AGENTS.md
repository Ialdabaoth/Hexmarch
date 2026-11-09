# Rules for Claude threads and other agents

Read CONTRIBUTING.md first. The short version for PRs in this repo:

1. **One open PR per app.** Before opening a PR, list the open PRs. If one changes the same app (Companion, Atlas, Scribe, engine, e9-core, VTT bridges, icons), don't open a second one alongside it: finish yours on the branch and wait for that PR to merge, or open it with `Merge after #N` in the description. The merge order check holds it until #N merges.
2. **Never edit a version number or add a numbered CHANGELOG.md entry.** Add `<app folder>/changes/<short-name>.md` holding the entry's text. The build numbers it when it merges. Only a release PR (`scripts/changes.py release|minor <app>`) touches versions.
3. **Name other changes by PR number**, never by the version you guess they'll get.
4. Before you push, merge `main` into your branch if it moved, and run the checks for what you changed (`scripts/data.sh`, then `npm run check && npm test` in `companion-app/` or `scribe/`).
5. Don't merge or enable auto-merge yourself unless Heph says so in the thread.
