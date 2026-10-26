# Measured Burgers vortex for Field Explorer

The Explorer example at `output/scientific-burgers-horizontal-level1.sscene` is a measured three-component water velocity field. It comes from tomographic particle image velocimetry, not from the analytic vortex generator.

**Attribution:** Webster, D. R. (2021), *3D velocity fields for the Burger vortex flow treatments*, Biological and Chemical Oceanography Data Management Office (BCO-DMO), version 1, DOI [10.26008/1912/bco-dmo.834530.1](https://doi.org/10.26008/1912/bco-dmo.834530.1). The [dataset record](https://www.bco-dmo.org/dataset/834530/description) identifies X/Y/Z in mm and V_x/V_y/V_z in m/s. The data are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This subset and its coordinate-unit conversion are changes to the source file. The source was accessed on 26 October 2026.

## Source and selection

| Item | Value |
| --- | --- |
| Original file | [flow_field.csv](https://datadocs.bco-dmo.org/dataset/834530/file/vmmwyR7c4JLlGB/flow_field.csv) |
| Original size | 133,557,055 bytes |
| Original SHA-256 | `31aa11b267183803bd3c4f40b30e5758a3d9ca7f09f539232341547375a79982` |
| Repository-published MD5 | `f2e18e754092c2e8e78eb71eaacdf407` |
| Selected rows | `Flow_field=horizontal`, `Level=level1` |
| Selected shape | 47 × 85 × 55, with x/y/z last-axis-fastest in the scene |
| Selected measured vectors | 219,725; no missing numeric values, duplicate cells, or omitted selected rows |
| Scene | `output/scientific-burgers-horizontal-level1.sscene` |
| Machine-readable recipe | `output/scientific-burgers-horizontal-level1.curation.json` |

The selected treatment is a complete Cartesian product of its X, Y and Z coordinates. The CSV rounds positions to six decimals in mm: each coordinate differs from the endpoint-derived regular axis by at most `7.61 × 10⁻⁷ mm`. The converter requires a residual at most `1.1 × 10⁻⁶ mm`, then records origin and spacing in metres (`mm × 0.001`). It leaves the measured velocity numbers in m/s, rearranges them by x/y/z index, and makes no interpolation or missing-value replacements. The manifest's source SHA-256 is the original complete CSV hash. The companion recipe records the DOI, selection, unit conversion, source hash, and scene fingerprint.

## Reproduce and verify

Download the original file to the ignored `data/` directory, then run:

```powershell
npm run build:main
node scripts/audit-bco-dmo-vortex.mjs data/bco-dmo-834530-flow_field.csv
node scripts/curate-bco-dmo-vortex.mjs data/bco-dmo-834530-flow_field.csv output/my-burgers-copy.sscene
npm run test:scientific:measured
```

The converter refuses a changed source hash or existing destination. `test:scientific:measured` fully verifies the checked-in v3 scene, compares three grid positions with literal rows from the original CSV, checks XY/XZ/YZ slices against the same probe, rejects altered overview and tile bytes, and measures the first verified transfer in three isolated Node processes per view. A local Windows/Node 24.19.0 run produced:

| First transfer | Median time | Median peak RSS increase | Values per component |
| --- | ---: | ---: | ---: |
| 8³ arrow overview | 6.5 ms | 0.6 MiB | 512 |
| XY slice | 16.1 ms | 6.0 MiB | 1,024 |
| Point probe | 7.5 ms | 1.4 MiB | 1 |

These are local observations, not release thresholds. A desktop test also imports the scene, refines arrows, and checks the measured probe value across all three slice views. The scene verifier authenticates the manifest-pinned resources and sample transfers. The companion curation JSON is linked by fingerprint and is not itself a manifest-pinned resource.
