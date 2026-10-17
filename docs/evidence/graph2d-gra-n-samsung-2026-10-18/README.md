# GRA-N06/N08/N09/N10 focused Samsung check — 2026-10-18

The connected physical Samsung `SM-A566B` (Android 16, 1080 × 2340) ran `com.math3d.mobile.internal`. The final internal APK was built from source commit `b69e7522`, with SHA-256 `2182B62A41DE181FB14D82FF7BC412FDDB00F34E406EA6953B01389AEE088B41`. The checks used scripted ADB taps, swipes, UI hierarchy reads and screenshots. They establish focused device behavior, not human touch, spoken accessibility, signed release, or the full MOB-G13 matrix.

## Unit circle and constrained dragging

In **Graphs → Gallery → Circle and ellipse**, the blue unit circle's saved point at `t=0.0018160007661862446` read `(0.9999984, 0.001816000)`, derivative `(-0.001816000, 0.9999984)`, speed `1.000000`, and curvature `1.000000`. Its osculating circle read center `(-2.2204460e-16, -4.3368087e-19)` and radius `1.0000000`. Tangent, normal, curvature and osculating circle were all ready together in [the construction view](circle-all-derived.png). These values agree with the exact unit-circle reference to displayed precision; the Inspector marks the derivative rule as approximate.

Dragging the saved point from near the right of the circle toward the top changed its source parameter to `1.5732518715086334`. The point, tangent, normal, curvature and osculating circle updated together. At an intermediate frame of a slower drag, the Inspector read `t=0.930633072452065` and point `(0.5973264, 0.8019983)` while the directional overlays had rotated [on screen](circle-mid-drag.png). Releasing and using **Undo** restored the original parameter; **Redo** restored the dragged parameter. The sampled intermediate frame demonstrates live updates; the scripted gesture does not measure finger-to-photon latency.

## Expression parameter

In the interactive Circle and ellipse project, **More → Parameters → Add expression parameter** accepted `b = 2*a` and evaluated `b = 4` with slider `a = 2`. Previewing `a = 1` recomputed `b = 2` [in the same sheet](expr-preview.png). **Cancel preview** disabled Apply and restored the original ellipse shape. The deterministic animation advanced from frame 3 to [frame 21 of 21](animation-complete.png), ending with `a = 2.3` and derived `b = 4.6` [on screen](animation-values.png). This checks the visible frame sequence and final dependency value, not frame timing or exported frame files.

## Geometry target preview

The mobile promotion action now says **Create target and show preview**, matching its embedded target preview rather than implying a separate mobile Geometry viewer. Opening a persisted target after restart showed the complete [closed profile](target-preview-fixed.png). A unit test covers the preview's first and last endpoints. The mobile renderer distributes its 768 preview segments across the entire 1,024-segment Geometry target instead of truncating the final quarter. The target's full source geometry remains unchanged.

## Remaining gates

MOB-G13/G2D40 still require a release artifact and broader device, orientation, accessibility, long-run, and gesture-interruption evidence. iOS is deferred by the user. A dedicated full mobile Geometry viewer remains separate from this bounded preview.
