#!/usr/bin/env bash
# Copy the data the apps are built with from the data repo (site.json "data"): mm-core (bundled into the
# Companion) and links.json (Patreon link). These copies are git-ignored; the data repo is their source.
# usage: scripts/data.sh [path to a checkout of the data repo]   (default: clone it into .data/)
set -euo pipefail
cd "$(dirname "$0")/.."
repo=$(python3 -I -c 'import json; print(json.load(open("site.json"))["data"]["repo"])')
src=${1:-.data}
if [ -z "${1:-}" ]; then
  if [ -d .data/.git ]; then git -C .data pull -q --ff-only; else git clone -q --depth 1 "https://github.com/$repo" .data; fi
fi
python3 -I -c 'import json; print("\n".join(json.load(open("site.json"))["data"]["copy"]))' | while read -r p; do
  rm -rf "$p"; mkdir -p "$(dirname "$p")"; cp -R "$src/$p" "$p"; echo "copied $p from $repo"
done
