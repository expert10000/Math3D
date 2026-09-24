# Math3D iOS companion validation

MOB54 establishes the first maintained iOS companion build gate. The gate creates an unsigned Release app from locked dependencies, launches the same artifact on small and current iPhone simulators, checks the initial and resumed viewport screenshots, captures logs, and publishes the zipped app with SHA-256 metadata.

## Renderer contract

Expo GL does not present React Three Fiber frames in the hosted iOS simulator used by CI. Math3D therefore uses a bounded CPU-projected wireframe preview on iOS. It consumes the same generated surface geometry, camera orbit, visibility, selection, and scene state as the Android renderer. Orbit, pan, zoom, object management, formula creation, projects, compute jobs, and analysis summaries remain available.

Android continues to use the interactive Expo GL renderer. The iOS compatibility renderer intentionally omits shaded faces and GPU analysis overlays until a validated native iPhone GPU path replaces it.

## Maintained gate

The `Mobile iOS Companion Gate` runs for mobile changes on `main` and can also be dispatched manually. Acceptance requires:

- mobile identity and TypeScript checks;
- focused projected-scene unit coverage;
- a clean unsigned Release simulator build;
- visible surface geometry on small and current iPhone screenshots;
- successful terminate/relaunch viewport recovery;
- a reproducible zip checksum and build metadata artifact.
