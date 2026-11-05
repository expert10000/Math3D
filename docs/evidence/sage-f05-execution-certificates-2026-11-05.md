# SAGE-F05 execution certificates and provenance — 2026-11-05

In **CAS or Number Theory → Structures → saved result → Execution**, new object-linked Sage results show a versioned execution certificate. It is embedded in the Project algebra evidence and follows `.math3d` Project export and import.

The certificate records the operation ID and input/output schema IDs, every pinned target and parent object revision with definition hash, canonical request and result hashes and byte sizes, backend route, Sage version, job ID, elapsed wall time, warnings, outcome and representation. A declared ideal budget is retained when present. The GAP group dossier records its reported GAP version. Algorithm, proof mode and peak memory remain null when not reported or measured.

The verifier level is **schema-and-binding**: the saved result passes its operation-specific parser, source revisions match the Project registry, and the result hash matches. This certificate does not assert a general mathematical proof. The Inspector's separate Verification section continues to show operation-specific mathematical checks and their accurate `CHECKED`, `COMPUTED` or `FAILED` mode. Older evidence without a certificate remains importable and is labelled as legacy in Execution.

**Acceptance:** An exact `QQ[x,y]` reconstruction certificate pins both `Q` and `R` definitions. Independent Project package import retains it. Changed source lists, invented algorithms and forged proof claims are rejected. Focused tests cover other saved algebra operations, and the desktop Inspector opens a saved certificate and shows its hash and proof qualification.

The live Docker Sage 10.10 gate ran the same `QQ[x,y]` reconstruction through `http://127.0.0.1:8767/run`, then saved its real response, certificate and independently reopened Project package. Run it with `MATH3D_SAGE_LIVE=1 npx vitest run tests/unit/sageExecutionCertificate.live.test.ts` while the local worker is available.

**Scope:** Certificates attach to successful object-linked Project algebra evidence. Failed, cancelled and unavailable jobs are not saved as successful evidence. Workbook Sage code runs have their existing separate source and runtime provenance; a shared certificate across that path is future work.

**Next:** SAGE-F06 versioned Sage capability manifests for WSL and Docker routes.
