# SAGE-C06 ideal operation budgets and cost warnings — 2026-11-04

## Delivered

CAS → Algebra → Operations now shows an input-cost signal and an explicit budget before running a saved-ideal operation. The signal lists variable and generator counts, a conservative degree and syntactic term bound, and monomial order. It warns that these counts cannot predict Gröbner-related runtime. The default **standard** profile caps a new request at two variables, three generators, degree 8, 48 terms per polynomial, 16,384 result bytes and 15 seconds. The **expanded** profile caps it at three variables, six generators, degree 16, 128 terms per polynomial, 65,536 result bytes and 30 seconds. Advanced syzygy and Hilbert operations retain their stricter C05 two-variable/three-generator gate. Selecting expanded in the desktop UI requires acknowledging its higher possible cost before Run becomes available.

New desktop Operations and starter-recipe requests carry a versioned, exact budget object. The core checks input bounds before dispatch and checks saved result byte size before evidence is accepted. The Sage worker independently matches the requested profile to its reviewed constants, checks actual polynomial degree and term count after construction, and caps output bytes. The service adapter applies the shorter wall-clock deadline to its Sage subprocess and kills it when the deadline expires. Invalid, inflated, null or unknown budget fields are rejected. The global 30-second service cap still applies to every request.

Existing C02–C05 Project evidence and recipe hashes without a budget remain importable under the earlier fixed worker limits. New Project evidence retains its exact profile, limits and result hash; the Inspector displays the saved budget and execution time. Newly created recipe stages use the standard profile. Starter creation rejects an input that exceeds that profile with a specific budget reason. B07's partial-failure evidence retention continues to apply to failures during a saved recipe run.

## Acceptance

- Core fixtures reject a degree-nine standard request, accept its explicit expanded request, reject a forged higher degree limit and an oversized result, and independently reopen legacy evidence without budget metadata. The syntax analyzer checks `degree ≤ 16` and computes conservative expansion bounds before dispatch.
- Real local Sage 9.5 fixtures reject degree nine under standard, compute it under expanded, and reject changed wall time, enlarged limits and a null budget. Adapter tests check standard 15-second and expanded 30-second deadlines, the 30-second hard cap for invalid or unrelated requests, and actual subprocess kill on an injected deadline.
- Desktop acceptance checks the visible cost warning, default standard recipe requests, disabled Run on selecting expanded, explicit acknowledgment, the expanded quotient request and independent Project reopen.

These are hard request, worker and wall-clock limits, not a measured runtime estimate or a memory cap. The B08 live Docker Sage 10.10 comparison remains open; local Sage 9.5 and controlled desktop HTTP fixtures do not substitute for it.

## Next

Track C is complete through C06. The next roadmap feature is **SAGE-D01**, a number-field object builder. Complete B08's live Docker Sage 10.10 comparison when that runtime is available.
