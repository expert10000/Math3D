# Pinned ideal QEC saved run

`saved-run.json` is a Theory Lab `qec-repetition-run/v1` manifest from its real Python worker, using prescribed flips `[0, none, 1]`. The result intentionally ends with two data errors, an ambiguous minimum-weight final correction and logical result 1. The adjacent `.qscene` was exported from that exact saved record. It contains the recorded syndrome, defect and data-bit arrays and no surface-code claim.

The Math3D release matrix pins the complete scene fingerprint. `node scripts/test-quantum-qec-baseline.mjs` verifies the saved manifest and trace digests, independently recomputes all 21 recorded bits, and compares the imported binary datasets and source identity. The normal Theory Lab worker and two-app tests remain the producer/runtime checks.
