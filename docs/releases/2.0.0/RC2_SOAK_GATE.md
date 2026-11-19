# M3D20-17c — source recovery and deferred memory soak

**2.0 release disposition (2026-11-19):** Hard-exit Project recovery remains required on the exact frozen source commit. The reference-host mixed-route two-hour memory plateau and installed memory qualification are [open in the 2.5-or-later track](../2.5.0/MEMORY_QUALIFICATION.md). The passing hosted-runner two-hour source receipt does not qualify the reference workstation or an installed package.

Run the 2.0 recovery gate on the clean, built, frozen checkout:

```text
node scripts/release20-source-recovery.mjs --run <freeze-manifest> <evidence-json>
```

The `math3d/release20-source-recovery/v1` receipt binds Project contracts, scientific goldens, the quantum baseline, build identity, first-use Study, and hard-exit Project recovery to the same source commit and freeze SHA-256. A failed or missing hard-exit check blocks 2.0 sign-off. The receipt explicitly records `memoryQualification: "deferred-to-2.5-or-later"`; it is not a memory pass. The [RC2 rehearsal verifier](../../../scripts/verify-release20-rc2-rehearsal.mjs) requires this exact recovery receipt and keeps the signed installer, clean install, four journeys, 1.7 upgrade, asset integrity, Gallery, site, and GA review gates intact.

## Later-release two-hour memory qualification

The original two-hour source runner and its unchanged budgets remain available for the later memory track. Use `node scripts/release20-rc2-soak.mjs --plan` to inspect it. On a reviewed, clean checkout, run:

```text
node scripts/release20-rc2-soak.mjs --run <freeze-manifest> 120 <evidence-json>
```

The freeze manifest must identify the exact checkout and dependency/schema hashes. The duration is a minimum of two hours and a maximum of 24 hours. Each cycle runs Project contracts, scientific result goldens, the quantum baseline, a desktop first-use Study save/restart, hard-exit Project recovery, and a same-process navigation/memory observation lasting the requested duration. A cycle that reaches the deadline still completes all checks. The evidence JSON records the source commit, freeze manifest hash, requested and elapsed time, each check result, and any failure. The adjacent `release20-long-memory.json` records 100-action cycles, ten-action process-tree RSS and CDP V8 heap samples, renderer/GPU private bytes, page errors, and peak sampled RSS. It refuses an E2E-hooked runtime. Keep both under an ignored evidence directory so the run does not dirty its source.

The runner reviews the memory observation with `node scripts/check-release20-long-memory.mjs <memory-receipt> source <review-json>` and fails on incomplete duration, lost samples, page errors, mismatched build identity, or a source memory budget failure. The [source long-memory limits](PERFORMANCE_BUDGETS.json) are 2,048 MiB peak process-tree RSS, at most 64 MiB late-window RSS growth, 1,024 MiB peak renderer private bytes, at most 32 MiB late-window renderer-private growth, **544 MiB peak GPU-process private bytes**, and at most 32 MiB late-window GPU-private growth. The GPU peak was revised from 512 MiB on 2026-11-16 using three clean 800-switch runs of the same renderer bundle; the growth ceiling was retained. Receipt v2 retains every ten-action sample for the absolute ceilings and adds one CDP garbage-collected sample after each 100-action cycle. The preceding and final fifths of those cycle-end samples define each late-growth comparison. This separates retained memory from the time of Chromium's automatic collection without relaxing peak limits. A stable GPU process ID and zero observed WebGL context-loss events are required. These are source acceptance targets; they do not certify installed memory. `MATH3D_MEMORY_SOAK_SMOKE=1` runs one 100-action cycle for development; `MATH3D_MEMORY_SOAK_SMOKE_CYCLES=10` extends that diagnostic to ten cycles, and `MATH3D_MEMORY_SOAK_FORCE_GC=1` captures cycle-end collection in a smoke run. Smoke output cannot satisfy the two-hour reviewer. Installed mode fails closed until a separately frozen installed budget and exact signed package hash exist.

This is **source-build** memory acceptance for the later track. The same-process portion observes interactive navigation over multiple hours and samples Electron private bytes plus GPU-process RSS as native-memory indicators. Cycle-end CDP collection measures retained memory; it does not measure GPU allocations. It does not exercise the signed installer, a live Sage backend, or device stability. Keep installed results separate and bind them to the same exact candidate before claiming installed memory qualification.
