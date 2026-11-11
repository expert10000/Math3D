# M3D20-17c — source reliability soak

The source manifests now identify 2.0.0, but no two-hour 2.0 soak has passed. Use `node scripts/release20-rc2-soak.mjs --plan` to see the checks. On the reviewed, clean 2.0 checkout, run:

```text
node scripts/release20-rc2-soak.mjs --run <freeze-manifest> 120 <evidence-json>
```

The freeze manifest must identify the exact checkout and dependency/schema hashes. The duration is a minimum of two hours and a maximum of 24 hours. Each cycle runs Project contracts, scientific result goldens, the quantum baseline, a desktop first-use Study save/restart, hard-exit Project recovery, and a same-process navigation/memory observation lasting the requested duration. A cycle that reaches the deadline still completes all checks. The evidence JSON records the source commit, freeze manifest hash, requested and elapsed time, each check result, and any failure. The adjacent `release20-long-memory.json` records 100-action cycles, ten-action process-tree RSS samples, page errors, and peak sampled RSS. Keep both under an ignored evidence directory so the run does not dirty its source.

Review the memory observation with `node scripts/check-release20-long-memory.mjs <memory-receipt> source <review-json>`. A valid two-hour source observation checks the existing reference-host RSS ceiling; its report keeps `plateauQualified: false` pending a measured late-growth budget and independent review. Installed mode fails closed until a separately frozen installed budget and exact signed package hash exist.

This is **source-build** acceptance. The same-process portion observes interactive navigation over multiple hours, but sampled process-tree RSS does not measure GPU allocations or forced-GC heap growth. It does not exercise the signed installer, a live Sage backend, or device stability. Keep installed results separate and bind them to the same exact candidate before RC2 sign-off.
