# Chunked scientific scene resources (v2)

For slice-heavy 3D scenes, [tiled v3 resources](scientific-scene-tiled-v3.md) let XY and XZ planes avoid the whole-file chunk coverage caused by this format's contiguous layout.

The v2 `.sscene` format keeps the v1 directory layout and raw `f64le` resource files. Its `bundle.json` uses `scientific-scene-bundle/v2`; its pinned `manifest.json` uses `scientific-scene/v2`. Each resource retains its whole-file `sha256` and adds:

```json
{"chunkBytes":65536,"chunkSha256":["<SHA-256 of bytes 0–65535>","<next chunk>"]}
```

Chunk ranges are contiguous, start at byte zero, and cover the resource exactly. `chunkBytes` is divisible by eight and between 4 KiB and 256 KiB; each resource has at most 256 chunks. The 64 KiB manifest limit and 16 MiB total resource limit still apply. The bundle's manifest hash pins the chunk list. The existing v1 reader and bundles remain valid.

For v2 3D field overviews, XY/XZ/YZ slices, and point probes, the desktop process opens the manifest and checks file identity and size, then reads and hashes only chunks containing requested samples. Derived slice colors request the displayed plane plus up to two neighboring planes for finite differences. It rejects a changed sampled chunk before returning values. The renderer checks the transfer checksum, saved source references, selected coordinates, and exact reported chunk coverage before displaying the result. Arrow, slice, and probe provenance shows verified chunk counts and component sample hashes; slices and probes also retain their source and view hashes. V1 bundles continue through full-file verification. Other scientific operations still verify every chunk and the whole-file hash.

**Verification scope:** A changed chunk outside the current sample is found when that chunk is requested or a full-file operation runs. A lazy preview does not claim whole-resource verification. Creating saved references from v2 metadata pins the manifest and its chunk hashes; each displayed result verifies the chunks it uses.

To convert a verified v1 bundle into a new v2 directory:

```text
npm run build:main
node scripts/chunk-scientific-scene.mjs path/to/source.sscene path/to/new-source.sscene 65536
```

The source directory is left intact. The converter refuses an existing destination, validates the v1 bundle first, and writes a new manifest fingerprint.

## First-view measurement

`npm run test:scientific:chunks` generates a 64 × 64 × 64 three-component scene (6 MiB of source values), converts it to 64 KiB chunks, checks v1/v2 preview equivalence and tamper rejection, then measures import plus the first 8 × 8 × 8 transfer in three isolated Node processes per format. On Windows with Node 24.19.0, one run gave:

| Format | Median time to first transfer | Median peak RSS increase | Median peak external-memory increase | Chunks verified per component |
| --- | ---: | ---: | ---: | ---: |
| v1 | 38.4 ms | 13.6 MiB | 12.1 MiB | Whole resource |
| v2 | 13.2 ms | 5.1 MiB | 1.6 MiB | 8 of 32 |

Both transferred 1,536 scalar values. The desktop test also measured a 74.1 ms median from clicking **Verify & render arrows** to the first visible verified `8 × 8 × 8` lattice on the smaller 21 × 21 × 17 fixture (three runs).

The same 64³ fixture was measured for the first YZ slice (normal x, first lattice plane) and point probe. Each figure is the median of three isolated Node processes, from opening the scene through the first verified transfer. The v1 baseline opens and verifies full resources, then transfers the bounded 32³ volumes used by the existing Explorer path.

| View | Format | Median first transfer | Median peak RSS increase | Median peak external-memory increase | Values transferred | Chunks/component |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| YZ slice | v1 | 44.8 ms | 17.7 MiB | 12.8 MiB | 98,304 | Whole resource |
| YZ slice | v2 | 9.0 ms | 2.8 MiB | 0.3 MiB | 3,072 | 1 of 32 |
| Probe | v1 | 45.8 ms | 13.6 MiB | 10.0 MiB | 98,304 | Whole resource |
| Probe | v2 | 7.9 ms | 1.5 MiB | 0.3 MiB | 3 | 1 of 32 |

In one desktop run on the 21 × 21 × 17 fixture, first visible YZ slice and probe took 73.9 ms and 88.3 ms from click to render. An XY plane can touch every contiguous chunk of a last-axis-fastest file; the lazy reader still transfers only its 2D samples, but this layout cannot reduce disk reads for that plane. The memory figures above are for the desktop process through the first transfer; the desktop timings include IPC and rendering. These are local measurements, not release thresholds; filesystem cache, storage and process load affect them.
