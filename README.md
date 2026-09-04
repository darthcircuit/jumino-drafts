# Junimo Drafts

A local-first Stardew Valley save designer. The app can start from bundled, game-generated Stardew Valley 1.6.15 templates for all eight farm layouts or import a full save. It previews farm entities on an abstract tile grid, changes identity/date/money/progression, edits the farm, and exports a ready-to-install ZIP containing the full save and `SaveGameInfo`.

## Run

```bash
npm install
npm run dev
```

Open the shown local URL. Choose any starter farm to create a new save, or import the main save file (for example `Refugio_394913360`, not `SaveGameInfo`) to edit that save in place.

## Checks

```bash
npm test
npm run build
```

## GitHub Pages

The production build uses the `/jumino-drafts/` project-site base path. The workflow in `.github/workflows/deploy-pages.yml` tests and deploys `dist/` whenever `main` is pushed.

For the first deployment, open **Settings → Pages** in GitHub and set **Source** to **GitHub Actions**. The site will be available at:

```text
https://darthcircuit.github.io/jumino-drafts/
```

## Safety model

- Processing is browser-only; saves are not uploaded.
- New-save and imported-save workspaces are distinct. Import mode keeps the existing game ID, multiplayer ownership, inventory, exact skill XP, farm type, locations, and untouched progression data.
- The imported XML is cloned before editing, and the original file is never modified.
- Unknown XML nodes and their order are preserved.
- All eight 1.6 farm variants use complete saves generated through the installed Stardew Valley 1.6.15 new-game flow. This preserves randomized debris, layout-specific defaults, and Meadowlands' starter coop/animals.
- New saves can include 0–7 unclaimed starting cabins. Cabins use each map's source-authored nearby cabin locations and include a complete serialized interior.
- Buildings, objects, trees, grass, crops, and resource clumps can be selected and moved by coordinate or live map placement.
- Shift/Ctrl/Cmd-click creates group selections which preview and move together; Escape cancels an active selection or placement tool.
- Source-extracted metadata renders buildable land, water, and restricted tiles for all eight 1.6 farm layouts.
- Placement rejects water, restricted/out-of-bounds footprints, duplicate coordinates, and overlapping buildings.
- Selection uses a two-click workflow: click one or more entities, move the pointer for a live atomic preview, then click to commit.
- Live previews show both the moved selection and the exact nearby destinations of displaced contents; XML changes only on the final click.
- Moving either one item or a selected group relocates loose contents in the destination to the nearest valid tiles, with a map-wide fallback.
- The build palette clones save-native objects and terrain with placement validation.
- The source-extracted building catalog supports completed exterior buildings including obelisks, Gold Clock, Mill, Silo, Well, Stable, Fish Pond, and Junimo Hut. Specialized buildings retain their XML runtime type and receive a fresh GUID.
- Coops are fixture-backed with a complete empty `AnimalHouse` interior, capacity state, feed hopper, and a fresh unique indoor location ID.
- Character controls cover identity, body type, hair, skin, accessory, pet type, and breed.
- Progression controls cover skill levels/XP, the bottom of the Mines, Skull Cavern, sewer and wallet-item unlocks, greenhouse repair, Community Center restoration, and resident friendship hearts.
- Editor controls are split into Character, Landscape, Buildings, Relationships, and Progression tabs.
- **Regenerate template** rolls a new source-weighted landscape at the selected density.
- **Remixed start** adds a user-selected number of randomly placed completed exterior buildings.
- Required default buildings can't be deleted; moved greenhouses receive the corresponding save flag.
- Export generates a new game ID and multiplayer ID references.
- The selected date is a **fresh-progression date**, not a simulation of skipped days.

See `SAVE_FORMAT_ANALYSIS.md` and `SOURCE_FINDINGS.md` for format and decompiled-source findings.

## Refresh map metadata

The checked-in metadata contains tile classifications, not game artwork. If the local game content changes, regenerate it with:

```bash
/home/john/projects/stardew-decomp-clean/.dotnet-9-linux/dotnet run \\
  --project tools/map-extractor/MapExtractor.csproj -- \\
  /home/john/projects/stardew-decomp-clean/Content src/maps
```

The extractor reads the real XNB maps through FNA/xTile and applies the relevant static checks from `GameLocation.isBuildable`.
