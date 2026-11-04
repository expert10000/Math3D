# GF-08 — saved Graph inflection and definite integral constructions

**Status:** first Graph construction gate implemented, 2026-11-04.

The bounded Graph critical-point scan can save a numerically validated inflection as a source-linked candidate construction. It retains the scan interval, local matching window, seed, residual, method and source generation. On each committed Graph revision it reruns the bounded scan against current parameter values and source expression. A unique local numerical match is shown as approximate; multiple matches, a missing match, incomplete work or a candidate that is no longer numerically validated is unavailable. The candidate's saved identity stays stable across recomputation and Project reopen.

A complete interval analysis can save a definite-integral construction. The document stores the explicit source ID and editable interval, signed or absolute mode, tolerance and evaluation budget. It stores no numerical value or symbolic claim. The construction resolver recomputes with the existing adaptive Simpson analyzer under the shared 12,000-evaluation and artifact-size limits. Incomplete intervals and exhausted work show an unavailable reason. The Inspector edits the saved recipe in one Graph command; undo restores the previous recipe and value. The current value is labelled numerical with an uncertified error estimate. Exact CAS output is not displayed because this gate does not obtain one.

The parameterized cubic fixture changes a Graph parameter, checks both constructions recompute, exercises an ambiguous inflection and incomplete integral, undoes an edit, then saves and reopens the Graph in a Project. The desktop gate authors a parameterized curve, saves both constructions, edits and undoes integral bounds, and reopens the Project.

Derivative-curve persistence remains separate. Its existing plot is a viewport-sized transient sample with gap and resolution behavior; it needs a declared saved domain, sampling policy and error model before it can become a durable construction. The roadmap's scientific-bundle foundation exit gate remains open.
