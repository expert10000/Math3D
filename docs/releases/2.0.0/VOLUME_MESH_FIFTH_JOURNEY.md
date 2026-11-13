# Candidate fifth journey: Volume → isosurface → Mesh

**Status (2026-11-13):** Bounded source and desktop Project journey implemented in an isolated branch. This is ACC-05, not a fifth required 2.0 GA claim. Promote it only after the mixed Mesh/Volume memory gate passes and the full negative-path and installed-candidate receipts below exist.

## User journey

1. Open a saved, source-qualified scalar Volume in a Project. Start with an analytic sphere sampled on a bounded grid with declared origin, spacing, units, and point centering.
2. Choose a finite isovalue and extraction settings. Run the Volume isosurface job. Show the source generation, threshold, algorithm/backend, numeric status, vertex/face counts, and warnings in the resulting card.
3. Save the extracted triangle Mesh as a **new Project document** with its verified Mesh sidecar, exact source relation, and extraction result. Open the owning Mesh document for native inspection. The Mesh must not silently follow later Volume edits.
4. Save a two-pane Volume/Mesh Study and a Workbook citation to the extraction result. Return from the Mesh to the exact Volume source and extraction settings.
5. Save, close, cold reopen, export a resource-bearing Project package, and import it into an independent profile. The Volume, retained Mesh, Study, result, relation, and Workbook citation must retain their identities and verified bytes.

The initial claim is **one static scalar Volume and one extracted isosurface**. The threshold is a sampled reconstruction parameter. Vertex counts and geometry are numerical outputs, not proof of topology or a smooth mathematical boundary. There is no general Mesh-to-Volume inverse or arbitrary cursor correspondence.

## Acceptance

| Case | Required observation |
| --- | --- |
| Current source | A completed extraction records the exact Volume generation, isovalue, smoothing settings, algorithm and producer. Its Mesh sidecar checksum and Project relation verify. |
| Source edit or changed threshold | The prior result becomes historical. The current-source transfer action is disabled; a deliberately saved snapshot remains separately labelled and never borrows the new source. |
| Cancellation or late worker response | No cancelled or superseded result becomes current, and no new Mesh or Workbook citation is published from it. |
| Missing or corrupt bytes | Missing Volume payload or Mesh sidecar withholds the affected Study pane and import/open action; a checksum mismatch is rejected. |
| Restart and transfer | Cold reopen and independent package import preserve Volume and Mesh generations, result, Study pins, and Workbook citations. |
| Runtime and memory | The connected route passes the clean 800-switch mixed Mesh/Volume budget, two-hour source plateau, and the exact signed Windows candidate's installed memory and viewer-disposal checks. |

## Current source evidence and gaps

- `renderer/src/volume/volumeExtractionKernel.test.ts` exercises a real worker extraction, revision-bound result and relations, retained Mesh bytes, a two-pane Study, Workbook references, independent package transfer, and missing or changed resource refusal. `tests/e2e/m3d20-native-job-lifecycle.spec.ts` separately exercises a late result after a Volume edit and cold reopening of historical evidence.
- The Project dashboard now offers a guided action for a current Volume extraction and its exact retained Mesh. It verifies resources before staging a two-pane Study and Workbook, and the Study shows source-qualified, read-only Volume and Mesh summaries with owning-document actions. `tests/e2e/volume-mesh-study.spec.ts` runs extraction → guided Study/Workbook → Project save → cold reopen → exact Volume return → changed-source refusal on the desktop source build.
- “Send to Mesh” still opens an active Mesh workspace handoff. The guided Project path uses the existing saved extraction record and resource sidecar; a dedicated one-click handoff from the native Volume result card to the saved Project Study is not yet present. The Study summaries do not render full Volume slices or Mesh geometry.
- The clean 800-switch mixed route and two-hour source memory plateau are still failing or unqualified. Installed candidate evidence does not exist. No Gallery card or 2.0 release promise should describe this journey as complete.

## Delivery order while memory work proceeds

1. Done in source: qualify a current extraction and retained Mesh, verify resources, create the Study and Workbook, and refuse duplicate publication.
2. Done in source: show exact-source Volume and Mesh Study summaries and owning-document actions. A full visual preview is a separate enhancement; avoid an extra WebGL viewer while the memory gate is open.
3. Extend the connected desktop test with independent package transfer and missing/corrupt resource refusal. Add a discoverable guided Gallery entry after its fixture and resource size are measured. Cancellation and late-result refusal have separate source coverage but should be bound to this journey.
4. Re-run the complete path on the frozen signed candidate only after memory qualification. Update the release scope and closure checklist if the fifth journey is then accepted as a 2.0 requirement.

The four existing flagship journeys remain the 2.0 release requirement while this candidate is built and measured.
