# Verified quantum scenes — Math3D design snapshots

Captured from the Math3D Electron checkout at `ae84c0f0` (2026-10-12), after fast-forwarding from remote `main` and rebuilding. The capture uses a 1500 × 960 desktop viewport and an isolated profile. It opens Math3D's nine pinned, hash-verified Theory Lab exports through the **Verified quantum examples** chooser. The local bundle path is masked in these images; the scene and numeric data are unchanged.

Regenerate after `npm run build:core` with `npm run capture:quantum:scenes`. The command saves the same set in this directory.

| Scene | Snapshot | Additional view |
| --- | --- | --- |
| Example library | [Chooser](00-example-library.png) | — |
| QWZ Berry curvature | [Supplied view](01-qwz-curvature.png) | [Reciprocal view](01b-qwz-curvature-reciprocal.png) |
| QWZ energy bands | [Band surfaces](02-qwz-bands.png) | — |
| SSH finite chain | [Sites and links](03-ssh-chain.png) | — |
| SSH energy bands | [Band lines](04-ssh-bands.png) | — |
| Hydrogenic 1s | [Density slice](05-hydrogen-1s-slice.png) | — |
| Hydrogenic 2s | [Density slice](06-hydrogen-2s-slice.png) | — |
| Hydrogenic 2p | [Density slice](07-hydrogen-2p-slice.png) | [Density surface](07b-hydrogen-2p-surface.png) |
| Hydrogenic 3p | [Density slice](08-hydrogen-3p-slice.png) | — |
| Hydrogenic 3d | [Density slice](09-hydrogen-3d-slice.png) | [Density surface](09b-hydrogen-3d-surface.png) |

## Initial design observations

- The chooser provides a clear inventory, but every scene opens in the same fixed-size modal rather than a dedicated visual workspace. The right source inspector takes about one quarter of the scene width.
- QWZ curvature reads well as a 3D surface. SSH's long chain is much smaller at the same framing and would benefit from a model-aware initial camera/zoom in a future design pass.
- Orbital examples open as density slices, so the user does not initially see the 3D orbital form. The optional surface view is present, but its default uniform color and threshold can obscure sign or angular structure; the underlying source should not be reinterpreted to fix a presentation problem.
- In the inspector, hashes, bundle provenance, model inputs, scientific quantities, and view controls share one long scroll. A future layout could separate provenance from the active scientific selection while keeping both available.

These are presentation observations only. The capture adds no physics, worker call, scene mutation, or Math3D-to-Lab dependency.
