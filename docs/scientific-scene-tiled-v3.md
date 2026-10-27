# Tiled scientific scene resources (v3)

V3 keeps the `.sscene` directory, `f64le` values, logical last-axis-fastest dataset order, and manifest fingerprint. `bundle.json` uses `scientific-scene-bundle/v3`; `manifest.json` uses `scientific-scene/v3`. V3 is limited to 3D datasets. Each resource has a physical tile layout:

```json
{
  "layout": "tiled-3d",
  "tileShape": [16, 16, 16],
  "tileSha256": ["<first tile SHA-256>", "<next tile SHA-256>"]
}
```

The converter also writes an optional bounded overview beside each component:

```json
"overview": {"path":"east.overview.f64","shape":[8,8,8],"bytes":4096,"sha256":"<SHA-256>"}
```

Tiles are ordered by x tile, then y tile, then z tile. Values within a tile are last-axis-fastest; edge tiles contain only their actual values and have no padding. Tile hashes cover the physical bytes of each tile. The resource `sha256` covers the complete physical file. The manifest hash pins the tile shape and hashes. Each tile is at most 256 KiB, with at most 256 tiles per resource; the existing 64 KiB manifest and 16 MiB resource budgets still apply.

The desktop reader checks resource identity and size, then reads and hashes only tiles containing requested slice, finite-difference stencil, probe, or full-detail arrow samples. The first 8³ arrow transfer uses the overview when available and verifies its complete file hash. Core checks tile coverage or the exact overview digest, transfer checksums, and saved source references. A changed requested tile or overview is rejected before display. Full-file operations verify the complete resource and every tile, restore logical row-major values, and compare every overview value with its source sample. V3 bundles without an overview still use tiles. V1 and v2 bundles use their existing readers.

Convert a fully verified v1 or v2 scene that contains only 3D datasets into a new directory:

```text
npm run build:main
node scripts/tile-scientific-scene.mjs source.sscene new-tiled.sscene [tileX tileY tileZ]
```

The default tile shape is 16 × 16 × 16. The converter increases a dimension if needed to stay within 256 tiles. It verifies the input first, copies exact source samples into the 8³ overview, and refuses an existing destination. The overview adds 4 KiB per component.

Generate or reproduce the larger, deterministic scientific vortex scene for Explorer:

```text
npm run build:main
node scripts/write-scientific-large-vortex.mjs
```

The repository includes `output/scientific-vortex-80-overview.sscene`: an 80³ three-component velocity field, 12.3 MB of source values, with physical coordinates in metres and velocity in m/s. Pass a new `.sscene` destination and an optional cubic side from 16 to 80 to the script to make another size. The field is an analytic example, not measured observations.

## First-slice benchmark

`npm run test:scientific:chunks` generates a 64³ three-component scene (6 MiB of source values), makes v2 chunks of 64 KiB and v3 tiles of 16³ values, checks sample parity and changed-tile rejection, then measures scene open through first transfer in three isolated Node processes per view and format. One Windows/Node 24.19.0 run gave:

| Plane | Format | Median first transfer | Median peak RSS increase | Units read per component |
| --- | --- | ---: | ---: | ---: |
| YZ | v1 | 41.7 ms | 18.0 MiB | Whole resource |
| YZ | v2 | 8.0 ms | 2.9 MiB | 1/32 chunks |
| YZ | v3 | 13.5 ms | 5.7 MiB | 16/64 tiles |
| XZ | v1 | 40.0 ms | 17.9 MiB | Whole resource |
| XZ | v2 | 23.1 ms | 10.0 MiB | 32/32 chunks |
| XZ | v3 | 13.3 ms | 5.6 MiB | 16/64 tiles |
| XY | v1 | 40.3 ms | 17.6 MiB | Whole resource |
| XY | v2 | 23.0 ms | 9.9 MiB | 32/32 chunks |
| XY | v3 | 13.5 ms | 5.6 MiB | 16/64 tiles |

Each slice transferred 3,072 scalar values. A probe read one v3 tile per component. The table measures the tile path for slices; the overview sidecar is used only for the first 8³ arrow transfer. V3 improves the two expensive plane orientations in this layout, while v2 remains faster for this YZ plane.

## First overview on a larger scientific scene

`npm run test:scientific:overview` generates the 80³ vortex, compares overview values with the fully verified v1 source, rejects an altered overview, and measures the first 8³ transfer in three isolated Node processes. One Windows/Node 24.19.0 run gave:

| Format | Median first transfer | Median peak RSS increase | Source units read/component |
| --- | ---: | ---: | ---: |
| v1 full resource | 70.3 ms | 27.0 MiB | Whole resource |
| v3 tiles only | 41.8 ms | 16.6 MiB | 125/125 tiles |
| v3 with overview | 8.1 ms | 0.6 MiB | One verified 4 KiB overview |

The three overviews add 12 KiB to the 12.3 MB source bundle. These are local measurements, not release thresholds; storage cache and process load affect them.

**Verification scope:** A lazy view verifies only the tiles or overview it uses. A change elsewhere is found when that unit is requested or during a full-file operation. The converter and full-file reader check overview/source parity; a lazy first view authenticates the manifest-pinned overview without reading the source tiles. Source and sample hashes in Explorer identify the exact verified transfer and do not claim that unseen tiles were checked.
