# GRA-12.7 — cancellable mobile polynomial fits

**Software scope, 2026-10-17.** Linear, quadratic, cubic and quartic point-series fits now use the shared reorthogonalized QR computation as a bounded job. The synchronous desktop/web entry point runs the same stages without event-loop yields. Mobile Analyze advances polynomial fits in batches of at most 2,048 rows per numerical stage and yields between batches. It shows progress and **Cancel fit** while a fit is pending. A cancelled job cannot return or publish a new result. The existing source, draft, navigation, background and unmount cancellation rules now cover all five reviewed models, including the earlier spline.

The QR projections, normalization, right-hand side and residuals retain their row order and compensated sums. Exact coefficient, residual, interval and result-identity parity between batched and direct paths is tested for all four polynomial degrees. Existing independent mathematical references and the 10,000-row regression performance guard remain in force. The batch test measures computation only; it excludes timer scheduling, React rendering and Android device latency.

UI path: **Graphs → Workspace → Analyze → Linear, Quadratic, Cubic or Quartic regression → select a point series → Run analysis**. **Cancel fit** appears beside Run while the job is pending. The previous completed result remains visible subject to its existing stale-source/input status.

The desktop Graphs plot also now renders a spline fit without constructing polynomial confidence-band polygons. Spline results have only fitted `x,y` samples and intentionally no intervals; the previous unconditional band projection attempted to pass `undefined` coordinates to the world-to-screen transform and raised `Graph2D world point must be finite`. A renderer regression test covers the spline overlay without a band.

The internal Android APK was installed on the EnterpriseAnalytics_Pixel emulator with the 10,000-point regression Gallery scene. Quartic analysis displayed `n=10000, excluded=0`. A second Run followed by **Cancel fit** displayed “Fit cancelled. No new result was published.” while the previous result remained. This checks the emulator interaction; Samsung touch latency remains a separate physical-device measurement.

Physical Samsung latency, touch cancellation timing and spoken accessibility evidence remain under MOB-G13/G2D40. iOS signoff remains deferred by the user.
