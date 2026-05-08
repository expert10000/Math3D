# TODO

## Real bundle thinning (not only warning suppression)

### Goal
Reduce the initial JavaScript payload by splitting heavy mode-specific code from `renderer/src/App.tsx` into lazily loaded modules, instead of only increasing `chunkSizeWarningLimit`.

### Why
Current production build has a large entry chunk (`assets/index-*.js` around 1.1 MB minified), which hurts startup parse/execute cost. The warning was silenced by raising the threshold, but the runtime cost is still there.

### Scope
1. Extract major app modes into separate modules (for example: Surfaces, Geometry, Topology, 2D Mobius/Chebyshev/maps).
2. Replace eager imports in `App.tsx` with `React.lazy(() => import(...))`.
3. Render lazy modules through `Suspense` with a small fallback (`Loading module...`).
4. Keep state/UX behavior unchanged after module load.

### Acceptance criteria
1. `npm --prefix renderer run build` succeeds.
2. No functionality regressions when switching modes.
3. Entry chunk (`assets/index-*.js`) is significantly smaller than baseline.
4. Heavy code is moved into dedicated async chunks (for example `mode-geometry-*`, `mode-surfaces-*`, etc.).

### Verification
1. Compare before/after build output chunk table.
2. Smoke test mode switching and first-load lazy fallback behavior.
3. Confirm each mode loads once and re-opens from cache without repeated UX disruption.

