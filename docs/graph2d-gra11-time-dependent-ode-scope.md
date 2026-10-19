# GRA-11.8 scope: time-dependent ODE trajectories

**Status: software delivered for the defined GRA-11.8 roadmap milestone, 2026-10-19.** The bounded choices below are the implementation contract. Physical mobile visual and accessibility signoff remains in the existing Graphs release gate.

The [focused Samsung walkthrough](evidence/graph2d-gra11-8-samsung-2026-10-19/README.md) verified the Gallery and create/edit/save/reopen journey, both intended Gallery stop reasons, and Android accessibility labels on a standalone internal APK. Actual TalkBack speech and the full physical release gate remain pending.

## User problem and boundary

Graphs should let a user author one scalar initial-value problem

`x′(t) = f(t,x),  x(t₀) = x₀`

and see approximate solution paths forward and backward from an editable `(t₀,x₀)`. The horizontal plot coordinate is **time `t`**; the vertical coordinate is **state `x`**. This differs from existing `dy/dx = f(x,y)` slope-field trajectories and from autonomous planar phase portraits, which plot state against state. The first slice contains one state variable and one initial condition per saved object. Multiple objects can be added for comparisons.

The slice does not infer an ODE from an ordinary graph, draw a phase portrait, compute equilibria or nullclines, solve a system of equations, claim a symbolic solution, or add animation. It uses the checked Graph expression language, including existing named parameters, with `t` and `x` reserved as the independent and state variables in this object. Linear axes are required.

## Saved source and authoring

Introduce a distinct versioned Graphs capability and source kind for a time-dependent ODE. Save the derivative expression and checked AST, label, finite time bounds `[tMin,tMax]`, finite state bounds `[xMin,xMax]`, one finite initial time `t₀`, one finite initial value `x₀`, and the normal plot style. Save mathematical intent, not sampled points or transient stop results. Require `tMin < tMax`, `xMin < xMax`, `t₀` inside the time bounds, and `x₀` inside the state bounds; inclusive endpoints are valid. Limit each time direction to at most 100 time units from `t₀`, consistent with the phase-portrait horizon. Reject an expression that cannot be parsed with `t`, `x`, and the document's named parameters. Changes to the equation, bounds, initial condition, or style are one undoable edit and recompute the path. Save/reopen and export use the same source and sampler on desktop, web, and mobile.

In **Graphs → Functions**, offer **Add time-dependent ODE** and an editor with `x′ = f(t,x)`, `t minimum`, `t maximum`, `x minimum`, `x maximum`, `Initial time t₀`, and `Initial value x₀`. Preview can update while fields are valid; Save commits once. Invalid fields show a local error and leave the saved object intact. Its Functions card shows the equation and initial condition and supports Edit, Hide, and Delete. The plot marks `(t₀,x₀)` and visually distinguishes the backward and forward paths, with accessible text for both. Selecting the object shows the authored values and each direction's stop reason, last accepted `(t,x)`, and accepted/rejected step counts in Inspector or mobile Analyze. A zero-length path still shows the seed and its stop reason. Pan/zoom changes visibility, not the authored integration interval or saved result.

## Numerical contract

Integrate toward `tMin` and `tMax` from the same seed with adaptive RK4 step doubling and Richardson correction, matching the existing scalar trajectory method. Use local error tolerance `10⁻⁶ × (1 + max(|x_current|, |x_next|))`, a maximum proposed step of `(tMax-tMin)/64`, and a minimum step tied to the span and floating-point spacing at the current time. Cap accepted steps at 384 **per direction** and derivative evaluations at 12,000 **per object** or the lower scene budget, with the existing host deadline. The 384-step cap is reachable under the 6,000-evaluation share of a 12-call RK4 step. Reserve a fair evaluation share for each direction so a difficult backward path cannot silently consume the entire forward budget; unused backward evaluations may extend the forward path within the same object budget. Report accepted and rejected counts separately for each direction. Return finite, time-ordered samples only; never join across a failed evaluation. Do not infer a mathematical singularity solely from hitting a numerical limit.

Each direction returns exactly one explicit stop code:

| Code | Meaning |
| --- | --- |
| `time-boundary` | Reached that direction's authored time endpoint. This includes a seed already on the endpoint. |
| `state-boundary` | The next accepted solution step would leave the authored state interval; report the last valid sample, without drawing outside it. |
| `evaluation-failure` | The derivative was undefined or non-finite at required trial points despite step reduction. |
| `minimum-step` | Error tolerance could not be met before the safe minimum step. |
| `step-limit` | The per-direction accepted-step cap was reached. |
| `sample-limit` | The allocated derivative-evaluation budget was exhausted. |
| `deadline` | The host sampling deadline was reached. |

Unsupported logarithmic axes are an object-level `unsupported-scale` diagnostic with no integration; they must not be misreported as a time or state boundary. Invalid saved input is rejected by document validation, not turned into a numerical stop. The Inspector explains limits in plain language and labels paths as numerical approximations. A very narrow discontinuity can still be missed between evaluations; a failed trial must never bridge that gap.

## Gallery example

Add one editable **Differential equations** Gallery card, provisionally **Driven trajectory**:

`x′ = t - x`, `t₀ = 0`, `x₀ = 1`, time bounds `[-2,4]`, state bounds `[-1,8]`.

Its exact reference is `x(t) = t - 1 + 2 exp(-t)`. The forward path reaches the time boundary; the backward path reaches the upper state boundary. The card should label axes as time `t` and state `x`, mark the seed, show both stop reasons after opening, and suggest changing `t₀` and `x₀` to compare paths. Gallery launch creates an ordinary editable document through the same authoring action; preview generation, mobile projection, and exported plot use the same sampler and stay inside the existing Gallery cost budget.

## Acceptance before calling it delivered

- Reference checks for `x′=0`, `x′=t`, `x′=x`, and the Gallery equation compare both directions against analytic values within the documented tolerance. Include a nonzero `t₀` to catch accidental use of plot position or elapsed time in place of absolute `t`.
- Stop tests cover each code, a seed on either time boundary, state exit, undefined derivative, error-control underflow, both work budgets, deadline, and unsupported scale. Verify direction budgets and counts independently, and no segment spans an invalid sample.
- Document checks cover invalid bounds or seeds, unknown symbols and parameter-name collisions, capability validation, save/reopen, undo/redo, and recomputation after editing expression, parameters, or seed.
- Desktop/web and mobile journeys cover create, edit initial time and value, visible seed and two paths, per-direction Inspector/Analyze status, Gallery open/edit, export, and screen-reader labels. Physical mobile visual and accessibility signoff remains under the existing Graphs release gate.

## Fixed implementation choices

Use one initial condition per distinct saved object, a 100-unit maximum in each time direction, and an even reserved split of the 12,000-evaluation object budget between directions, allowing the forward path to use backward evaluations left unspent. At a state-boundary exit, render through the last accepted sample; do not interpolate an unverified endpoint.
