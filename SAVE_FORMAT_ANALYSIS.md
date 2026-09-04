# Stardew Valley save analysis

## Scope

Analyzed the four save folders in `existing_saves/`. The save data is XML, despite having no `.xml` extension. Files are UTF-8 with a BOM and are serialized as one very long line.

| Folder | Player / farm | Date | Farm type | Game version | Notes |
|---|---|---:|---|---:|---|
| `Leek_404858620` | Test / Leek | Spring 1, Y1 | 0 — Standard | 1.6.15 | Fresh save; one cabin and one farmhand |
| `Refugio_394913360` | Chani / Refugio | Spring 1, Y1 | 1 — Riverland | 1.6.15 | Fresh save; strongest current Riverland template |
| `Refugio_371082559` | Chani / Refugio | Spring 8, Y1 | 1 — Riverland | 1.6.8 | Includes a Spring 7 `_old` backup |
| `RoachyRoach_369519856` | Chani / Roachy Roach | Spring 6, Y1 | 3 — Hill-top | 1.5.6 | Old schema; includes a Spring 5 `_old` backup |

The fixture set now covers all eight vanilla 1.6 layouts through saves created by Stardew Valley 1.6.15 itself. Meadowlands is not saved as numeric type 7; it is a data-defined farm with ID `MeadowlandsFarm`, while runtime slot 7 means “custom/data-defined farm”.

## Save-folder contract

A normal folder is named `<farmNameWithoutSpaces>_<uniqueID>` and contains:

- `<folder-name>`: the full save, rooted at `<SaveGame>`.
- `SaveGameInfo`: a lightweight copy of the `<player>` record, rooted at `<Farmer>`, used by the load-game menu.
- Optionally `<folder-name>_old` and `SaveGameInfo_old`: previous-day backups.

There is no visible checksum or signature. `uniqueIDForThisGame` agrees with the numeric folder suffix. Building IDs are UUIDs and multiplayer IDs are signed 64-bit values.

In these samples, `SaveGameInfo` is structurally the same as the full save's `<player>` subtree after changing the root name to `<Farmer>`, except for `saveTime` (the menu metadata is written a little later). This means it should be generated from the edited player record rather than independently patched.

## Top-level model

The full save has three large areas:

1. `<player>` — identity, appearance, inventory, skills, money, quests, mail, relationships, stats, and mirrored load-menu date values.
2. `<locations>` — all mutable world locations. The farm is one `GameLocation` with `xsi:type="Farm"` and `<name>Farm</name>`.
3. Global state — date, weather, bundles, random seed/ID, mine state, options, version markers, and similar fields.

The 1.5.6 and 1.6.x schemas differ substantially. Unknown elements and their order should therefore be preserved. Generating a complete save XML document from a hand-written schema would be brittle.

## Date fields

The visible date is duplicated and all copies must be patched:

- `SaveGame/currentSeason`: `spring`, `summer`, `fall`, or `winter`.
- `SaveGame/dayOfMonth`: 1–28.
- `SaveGame/year`: 1 or greater.
- `SaveGame/player/dayOfMonthForSaveGame`.
- `SaveGame/player/seasonForSaveGame`: numeric 0–3.
- `SaveGame/player/yearForSaveGame`.
- The same player fields in generated `SaveGameInfo`.

Date selection has an important product ambiguity. Merely changing these values creates a fresh-progression world whose clock says a later date. It does **not** simulate skipped days: mail, quests, events, debris growth, friendships, TV recipes, and world unlocks will not have advanced as if those days were played.

Recommended initial behavior: explicitly call this **Fresh start on selected date**. Keep day-1 progression and patch only coherent date fields. A true “simulate to date” mode would require reproducing a large amount of game logic or running the game/SMAPI, and is not a realistic browser-only MVP.

## Farm representation

The editable farm state is concentrated under the `Farm` location:

- `buildings`: each has `buildingType`, `tileX`, `tileY`, `tilesWide`, `tilesHigh`, doors, paint, owner, construction state, and often an `xsi:type`. In 1.6, the farmhouse, greenhouse, shipping bin, and pet bowl are represented here.
- `objects`: a dictionary encoded as repeated `<item>` records. The key is a tile `Vector2`; the value is an `Object` or subtype such as `Chest`. The value repeats location in `tileLocation` and pixel geometry in `boundingBox` (`tile × 64`).
- `terrainFeatures`: another tile-keyed dictionary. Values include `Tree`, `Grass`, and `HoeDirt`; `HoeDirt` may contain a crop.
- `largeTerrainFeatures`: primarily bushes, with `tilePosition` and size.
- `resourceClumps`: multi-tile stumps, logs, and boulders, with tile, width, height, type/index, and health.
- `animals` / `Animals`: farm-animal ownership and lookup structures.
- Other farm flags: cave readiness, greenhouse state, spouse patio, hay, and paint.

Fresh farms already contain hundreds of generated debris and terrain records. For example, the fresh 1.6.15 Riverland farm has 485 objects, 258 terrain features, 14 bushes, 20 resource clumps, and 4 fixed buildings. The visual editor must distinguish fixed/map features, generated debris, and user placements.

The XML does **not** contain the base map's tile art, collision rules, buildable areas, water, entrances, or fixed scenery. Those come from game content. A correct visual designer therefore needs separate per-layout map metadata/assets. Without it, we can still build an abstract coordinate-grid editor, but cannot reliably validate every placement.

## Safest generation strategy

Use a **template-and-patch** pipeline:

1. Select a pristine template matching the target game version and farm layout.
2. Parse XML while retaining unknown nodes, namespaces, and ordering.
3. Patch player identity/appearance, farm name, unique IDs, date, and selected gameplay options.
4. Replace only supported farm collections/records.
5. Rebuild `SaveGameInfo` from the edited player subtree.
6. Emit a correctly named folder, optionally as a ZIP for browser download.
7. Validate by parsing the result again and checking cross-field invariants.

Do not use the 1.5.6 Hill-top save as a 1.6 template. Stardew may migrate it on load, but mixing records from 1.5 and 1.6 is unsafe. We need pristine 1.6.15+ day-1 templates for every supported layout. The game version should be shown as part of template compatibility rather than exposed as an arbitrary editable string.

## Proposed web-app architecture

A client-only app is suitable and keeps saves private:

- **Importer:** reads a save file/folder and uses `DOMParser` (or a lossless XML library).
- **Domain model:** a deliberately small normalized model for player settings, date, layout, and farm entities, while retaining the untouched source DOM.
- **Farm canvas:** tile grid with pan/zoom, layers, selection, placement, deletion, and overlap/bounds checks.
- **Patcher/exporter:** applies model changes back to cloned template DOMs and creates a ZIP.
- **Validator:** checks XML parseability, date mirrors, unique IDs, object key/location consistency, building dimensions, duplicate occupied tiles, and required files.

Avoid converting the entire XML to JSON and back: generic conversion commonly loses namespaces, `xsi:nil`, element order, exact integer precision, or type information.

For map art, prefer either user-supplied extracted game assets or original/abstract editor graphics. We should not copy copyrighted game assets into the repository without confirming redistribution rights.

## Suggested MVP

1. Support Stardew 1.6.15+ and one layout first (Riverland has the cleanest single-player sample; Standard needs its cabin/farmhand removed or a new pristine template).
2. Inputs: player name, farm name, favorite thing, gender/presentation basics, pet, starting money, season/day/year.
3. Farm tools: clear generated debris, preserve/remove fixed bushes and clumps, place/move supported buildings, paths, flooring, fences, chests, sprinklers, scarecrows, trees, and tilled/crop tiles.
4. Export a ZIP with full save and `SaveGameInfo`; include backups only if useful.
5. Test every generated fixture by loading it in the matching unmodded game version. XML validation alone cannot prove game compatibility.

## Open decisions / required inputs

- Target platform and exact Stardew version (desktop 1.6.15/1.6.16 is the best initial target).
- Source-confirmed layout IDs: Standard `0`, Riverland `1`, Forest `2`, Hill-top `3`, Wilderness `4`, Four Corners `5`, Beach `6`, and Meadowlands `MeadowlandsFarm`.
- Whether “start at date” means fresh progression on that date or curated story/progression milestones.
- Which farm layout to support first.
- Whether the editor should begin from a clean farm, preserve generated debris, or offer both.
- Whether modded objects/maps must be preserved on import (reasonable) or creatable in the editor (later feature).
- New pristine saves for missing layouts, ideally all created by the same current game version and saved immediately on Spring 1.
