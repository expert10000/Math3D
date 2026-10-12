# SSR footprint baseline — before generic contract code

Measured on 2026-10-12 from Math3D 1.5.0 build identity `097f2c97` (the subsequent commits before this measurement changed only documentation). Windows host, local Electron, isolated E2E profile, no scientific scene opened. These are comparison measurements, not cross-machine guarantees.

| Metric | Baseline |
| --- | ---: |
| Renderer entry JavaScript, raw | 3,190,253 bytes |
| Renderer entry JavaScript, gzip level 9 | 864,267 bytes |
| All 33 generated JavaScript chunks, gzip level 9 | 2,379,502 bytes |
| App-shell visible after launch, median of 3 | 1,410 ms |
| Electron process working set after 2 s idle, median of 3 | 570,572 KiB |
| Renderer reported JavaScript heap after 2 s idle, median of 3 | 42,100,000 bytes |

Reproduce after `npm run build:core` with `npm run measure:ssr:footprint` and `npm run measure:ssr:runtime`. The runtime measurement launches three fresh isolated Electron profiles, waits for the app shell, then samples all Electron processes after two seconds. Build output and OS memory can vary with caches, driver, machine load and Electron version; the heap API is approximate. CI thresholds should be set from repeated comparable runs, not from these numbers alone.

For SSR-01, the incremental initial JavaScript target is **under 100 KiB gzip** versus this entry baseline. The contract module must have no Python/CGAL/VTK/Sage dependency and no process launch. Scene-open and scene-close CPU/GPU memory deltas are deferred to SSR-04 because no generic scene is open in this baseline.
