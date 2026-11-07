# M3D20-17c — source reliability soak

The current repository is 1.7.0, so no 2.0 soak has passed. Use `node scripts/release20-rc2-soak.mjs --plan` to see the checks. On the reviewed, clean 2.0 checkout, run:

```text
node scripts/release20-rc2-soak.mjs --run <freeze-manifest> 120 <evidence-json>
```

The freeze manifest must identify the exact checkout and dependency/schema hashes. The duration is a minimum of two hours and a maximum of 24 hours. Each cycle runs Project contracts, scientific result goldens, the quantum baseline, and a desktop first-use Study save/restart. A cycle that reaches the deadline still completes all checks. The evidence JSON records the source commit, freeze manifest hash, requested and elapsed time, each check result, and any failure. Keep it outside the checkout or under an ignored evidence directory so it does not dirty the source during the run.

This is a repeated **source-build** acceptance run. It does not exercise the signed installer, a live Sage backend, GPU or device stability, memory growth inside the installed desktop process, or a multi-hour interactive session. Keep those results separate and bind each to the same exact candidate before RC2 sign-off.
