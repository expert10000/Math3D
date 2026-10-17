# GRA-12.5 — bounded cubic smoothing spline

**Software scope, 2026-10-17.** Desktop/web and mobile Graphs can fit a checked point series with a cubic smoothing spline. Choose **Cubic smoothing spline** in Inspector → Regression fitting on desktop/web, or Analyze → Cubic smoothing spline on mobile. Enter smoothness λ from 0 to 1 and run the fit. The result uses the original checksum-verified point-table rows within the authored domain. Display sampling and viewport changes do not alter the fit.

The model uses 12 control points in an open uniform cubic B-spline basis over the included x extent. It minimizes the unweighted squared residuals plus `λ × n` times the squared second differences of adjacent control coefficients. λ=0 is unpenalized least squares; larger λ favors smoother control coefficients. The bounded design needs at least 24 included rows and 12 distinct x values; a singular or ill-conditioned system fails explicitly. The reported residual SD is descriptive root mean squared residual. The fitted line has 129 samples, does not extrapolate, and the residual export includes the first 2,048 original row IDs.

**Uncertainty contract.** The spline does not publish confidence or prediction intervals. The polynomial fit intervals rely on a separate ordinary least-squares model and cannot be reused for a regularized spline. Fit warnings and publication metadata identify the basis, λ, row count, checksum, excluded rows, and absent interval semantics. Results are transient and become stale when their source or input changes.

This is a fixed-size smoothing model, not automatic knot selection, cross-validation, or a general interpolation package. Physical-device latency and mobile mid-fit cancellation remain separate validation work.
