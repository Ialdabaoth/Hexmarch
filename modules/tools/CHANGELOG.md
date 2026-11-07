# E9 Atlas: changelog

The E9 Atlas app and map tools (`modules/tools/`). The version lives in `ATLAS_VERSION`; every merged PR that touches the tools bumps the patch, each planned sprint bumps the minor. A module's own version is separate (see each module's CHANGELOG.md).

## 0.5.x (in development, now 0.5.1)

Sprint: git and VTT integration (campaign repo, shared state file, referee and player views, VTT polish). See "Queued for 0.5" below.

- 0.5.1: PoI hierarchies. A module names the place each sub-place collapses into (`site_parents` in module.json, `parent` in map.json). The Atlas draws a place as itself while its sub-places would overlap and as its sub-places once they come apart (always at Furlong). The key lists the places in view in every view, with ▶ in front of one that has sub-places; clicking it turns to ▼ and shows them indented underneath.
- 0.5.0: Credits: a **Credits** link in the Atlas footer lists the tile art and the loaded module's data sources. Modules list their sources in a new `credits` field in `module.json` (copied into the built manifest, and shown in the module viewer's footer too). Beyond the Pale credits the Ireland castle dataset (CC BY 4.0), ESA WorldCover, SRTM and Natural Earth; Hansa the same minus the castles.

- Encounter tool: a new `"dungeon"` style for built levels such as the B3 palace. It has a dark ground, flagstone rooms inside dressed-stone walls, and earthen caves. Other new features:
  - Built floor shapes take a `"room"` id. Wherever two shapes with different ids touch, the tool draws an inner wall, and the VTT export gets that wall too.
  - A `"partitions"` key holds extra inner walls, and `"openings"` now take inner walls out of the picture as well as the VTT walls.
  - A `"cells"` floor shape for caves traced square by square from a scan. The steps are smoothed and kept within a set distance of the traced squares.
  - A per-shape `"rough"` setting.
  - Water with its own `"colour"`.
  - Diagonal doors (`"dir": "d"` or `"a"`).
  - New marks: statue, pillar, trapdoor (with `"up"` for one in the ceiling), portcullis and curtain.
  - Existing maps come out unchanged.

### Queued for 0.5

From `strategy/mvp-checklist.md` (project files) and ENCOUNTER_FORMAT.md sections 13–14:
- Read and write the campaign state file (party hex and hours, revealed hexes and sites) instead of localStorage; referee moves write back.
- `view=player`: party marker plus revealed hexes and places only; referee layers, keyed text, monsters and unrevealed sites hidden.
- Referee reveal controls (by hand, and automatically for hexes the party enters).
- Site finder: search places by name in Irish or English.
- PoI hierarchies, next steps: Route and party arrive at the nearest sub-place (gate); parent footprint shaded on the Field view; player view shows only found sub-places.
- Module pinning: the campaign file names the module and exact version every device loads.
- VTT: test the E9 Bridge (0.1.0) in a live Foundry v12/v13 world; Owlbear Rodeo extension on the `e9-vtt/1` protocol; per-campaign "Open in Foundry/Roll20/Owlbear" scene links (section 13); `.e9vtt` file drop for VTTs that can't host a page.
- Rights check on encounter maps traced from PDFs before any public play.

## 0.4.18 (2026-11-07), 0.4.x closed

0.4.x was the VTT and referee sprint.
- 0.4.18: roads and river crossings (`atlas.roads`, Roman/local/trail classes); anchored encounter maps drawn to scale on the 100-ft view with their own surface picture.
- 0.4.17: party marker that moves along a route and keeps travelled hours; Patreon link in the footer.
- 0.4.16: place ranks thin out icons when zoomed out; Region icons at most 3 Leagues wide.
- 0.4.15: forests stay visible when zoomed far out.
- 0.4.14: zooming far out no longer blanks the map.
- 0.4.13: Patreon link turned on.
- 0.4.12: Route button, a first path tool.
- 0.4.11: terrain travel times (`atlas.travel`).
- 0.4.10: never mix an old map.json with the new loader.
- 0.4.9: tile cache, the map loads in pieces around the view.
- 0.4.8: Furlong level (500-ft hexes) between Field and the 100-ft hexes.
- 0.4.7: a point of interest is always one whole 100-ft hex.
- 0.4.6: Foundry VTT adapter (E9 Bridge 0.1.0) and Send to Foundry.
- 0.4.5: points of interest are entrances into encounter maps.
- 0.4.4: entrances and spawn points in the apps.
- 0.4.3: spec for entrances, spawn points and VTT adapters (`e9-vtt/1`).
- 0.4.2: Universal VTT import (`uvtt_import.py`).
- 0.4.1: Export for VTT (`.uvtt`, or picture only).
- 0.4.0: cleanup for Universal VTT import, export and VTT links.

Also during 0.4.x: per-module scale ladders (`unit_ft`, `mile_ft`), print PDFs off by default (`build.py --pdf` still makes them) and print page links hidden until print is discussed, build cache that skips redrawing unchanged maps.

## Earlier

0.3.0 (2026-11-06): one app at `/atlas/` that loads any module. 0.2.x (2026-11-05/06): map format, converter, real-world map pipeline, blends, key panel, encounter maps. See the git history for detail.
