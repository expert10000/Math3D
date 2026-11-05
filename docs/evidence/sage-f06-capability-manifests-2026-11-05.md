# SAGE-F06 versioned Sage capability manifests — 2026-11-05

In **Compute → Runtimes**, Local WSL and Docker now show a `sage-capability-manifest/v1` hash and an expandable operation list. Each row identifies a bounded or trusted-code operation, whether the current route supports it, and a deterministic reason when it does not: `runtime-unavailable`, `route-excluded`, `worker-unadvertised` or `console-unavailable`.

The manifest is derived from the current `/health` or WSL probe and the app adapter's route policy. It contains the reported Sage version, adapter version, backend ID, availability, advertised operation IDs, route-filtered operation decisions and the limits used by the broker. The broker's exposed operations are built from the same manifest. Refreshing a runtime regenerates the manifest; support is not inferred from the Sage version alone. The private gateway uses the same format but remains restricted to its bounded Number Theory route.

**Acceptance:** Schema and route tests compare the manifest's supported operations with broker discovery, reject a forged decision, and distinguish an unadvertised Docker operation from an unavailable WSL runtime. The live gate probes Sage 9.5 in WSL Ubuntu and Docker Sage 10.10, showing polynomial factorization on WSL, algebra reconstruction on Docker, and a route exclusion for WSL reconstruction. A desktop Runtimes gate shows the v1 manifest and changes its reason when a controlled Docker worker stops.

Run the live gate with `MATH3D_SAGE_LIVE=1 npx vitest run renderer/src/services/sageCapabilityManifest.live.test.ts` while WSL Sage and the local Docker worker are available.

**Next:** SAGE-F07 bounded queue cancellation and budgets.
