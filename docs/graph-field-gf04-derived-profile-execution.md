# GF-04 — brokered derived profile execution

**Status:** first analytic-source vertical execution implemented, 2026-11-04.

## Execution path

`field.derived-profile` is registered in the existing worker operation registry. `DerivedFieldProfileJob` submits the saved GF-03 magnitude → plane slice → line profile chain through `ExecutionService`, `ScientificExecutionBroker`, and `InProcessScientificJobService`. The first backend evaluates a verified authored expression vector field at the line's physical coordinates and returns bounded magnitude samples. Its source verifier must affirm the current vector document; scientific-bundle sampling is not admitted by this backend until it can use the existing verified transfer path.

The job accepts at most 2,048 samples, evaluates each component with the bounded expression evaluator, charges work and memory to the scientific job context, reports progress every 16 samples, yields between batches for cancellation, and enforces the broker deadline. The result records the profile ID, exact source generation, GF-03 recipe cache key, physical x axis, value unit, method and finite/null rows. Samples are cache artifacts, not Project source fields.

Publication requires broker success, a valid result matching the expected axis/unit/sample count, the latest request for that profile, and a second read of the current GF-03 recipe and verified source. The broker rejects a changed source generation. The publication check rejects a changed recipe or a superseded job. Cancellation and deadline failures return no result, including when an adapter finishes late. `read(profileId)` exposes the same guarded result to Explorer and Graphs; after Project reopen it returns `null` until the source verifier approves the exact saved generation again.

## Review gate

`renderer/src/kernel/derivedFieldProfileJob.test.ts` evaluates the committed GF-03 Project fixture's 17-point line for `F=(x,y,z)` and compares every value to `sqrt(x²+13)`. It checks progress, Project save/reopen withholding, source edit, recipe edit, cancellation with a late adapter, superseded publication and deadline failure. The GF-03 Project fixture and prior scalar recipes remain readable without migration.
