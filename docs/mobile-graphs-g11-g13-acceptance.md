# Mobile Graphs G11–G13

## MOB-G11 — tablet split pane

The measured workspace (after navigation/safe areas) uses a side panel at width ≥840 and height ≥480 logical pixels, both adjusted for font scale above 1. The panel is 340–440 scaled pixels; the graph retains at least 400 scaled pixels. Short landscape phones, narrow split windows and large text fall back to the scrollable phone sheet. These are reviewed layout thresholds, not device-name guesses.

Functions/Analyze/Display/Promote stay beside the graph on tablets. Graph defaults to the Functions side panel; phone Graph closes the sheet. Panel changes never create mathematical commands. Raw editor and analysis drafts, source selection and command history remain owned by the workspace, not a layout-specific mount. Plot resizing cancels an in-flight gesture instead of committing an obsolete screen transform. Native device checks are recorded below when performed.

## MOB-G12 — adaptive native workload policies

Sampling is scheduled outside render: animation-frame previews coalesce rapid viewport changes; a quiet 160 ms interval allows refinement. Request generations reject obsolete source/viewport publications and cancel pending frames/timers on changes, background and unmount. Matching-source preview geometry can remain visible while a viewport refines; probes require the current viewport artifact. Mathematical source, saved quality intent and command history are never modified by this policy.

| Policy tier | Interaction / preview / refine samples | Refine cooperative deadline | Native lines | Fills / markers per layer | Serialized sample artifacts |
| --- | --- | --- | --- | --- | --- |
| Low | 128 / 256 / 512 | 12 ms | 768 | 64 / 32 | 256 KiB |
| Mid (initial) | 256 / 512 / 1024 | 20 ms | 2048 | 128 / 64 | 512 KiB |
| High | 256 / 512 / 2048 | 32 ms | 4096 | 256 / 128 | 1 MiB |

Every sample policy is additionally capped by saved intent. Interaction deadlines are at most 8 ms; previews at most 12 ms. The shared sampler checks deadlines cooperatively, so this is **not a hard preemptive CPU guarantee**. Table reads, checksums, geometry serialization and native View creation have separate bounded sizes but can still exceed a frame budget. Diagnostics measure sampling plus table/serialization work and next-frame delivery (not GPU frame duration). Repeated slow work lowers one tier; six fast workloads can raise one tier after a recovery hold. These are conservative policy presets awaiting physical low/mid/high device calibration, not benchmarked device classes.

The point-table cache is capped at 4 MiB of serialized file bytes, with eviction/reload through immutable checksum-checked sidecars. Hidden/over-budget tables are not read for sampling. Background/memory warnings release sample artifacts, point cache and ephemeral analysis; source/drafts/history survive. Resume starts with preview before refinement. Native memory warnings and a user-operated Reduce workload control force the low tier with a 30-second recovery hold. Android does not guarantee memory-warning delivery: the fixed ceilings and manual fallback remain necessary. No thermal sensor is read; sustained slowdown is only a workload signal. Serialized byte limits are not a measurement or guarantee of total JS/native heap usage.

Focused tests cover policy ceilings, hysteresis/holds, stale publication tokens, scheduler coalescing/cancellation, bounded artifact/line output, point-cache eviction/reload/corruption and host deadline validation. Shared desktop defaults remain unchanged.

## Acceptance status

Physical Android and iOS release acceptance is pending; emulator or unit evidence is not a substitute. Advanced Curve/Surface worker analyses remain desktop-only; MOB-G11/G12 are layout/performance items, not worker-analysis delivery items.
