# Mixed-route memory qualification

**Status (2026-11-19):** The reference-workstation and installed-candidate memory gates are open. The 2.0 release decision defers their closure to 2.5 or later. The budget has not been relaxed, and 2.0 must not claim that these gates passed.

## Established evidence

- Clean `79325f2d` ran 56 mixed-route cycles and 5,600 actions for 121.6 minutes on the reference Windows i9 workstation. Its [receipt](../2.0.0/evidence/m3d20-long-memory-v2-79325f2d.json) and [review](../2.0.0/evidence/m3d20-long-memory-review-v2-79325f2d.json) failed post-GC renderer-private late growth at **53.8 / 32 MiB**. RSS, GPU-process and V8 limits passed; there were no page errors or context losses.
- Clean `4f4c244b` ran 54 cycles and 5,400 actions for 121.3 minutes on a hosted Windows 2025 AMD EPYC runner. Its [receipt](../2.0.0/evidence/m3d20-long-memory-ci-4f4c244b.json) and [review](../2.0.0/evidence/m3d20-long-memory-ci-review-4f4c244b.json) passed the declared source budget, including renderer-private late growth **24.2 / 32 MiB**. This is a hosted-runner source result; its GPU process peak **227.4 MiB** differs sharply from the reference workstation, and it does not qualify that workstation or an installed app.
- A clean ten-cycle local [compositor trace summary](../2.0.0/evidence/m3d20-compositor-base-summary-4f4c244b.json) shows `cc/image_memory` rising **45.0 → 70.0 MiB** and `partition_alloc` **37.0 → 58.3 MiB** while renderer private bytes rose **213.0 → 222.2 MiB**. These allocator categories can alias memory in other processes and cannot be summed. Hiding parked canvases did not reduce the image-cache trend in the [matched trial](../2.0.0/evidence/m3d20-compositor-hidden-summary-4f4c244b.json); that change was reverted.
- A longer clean local trace was stopped at eight cycles to free the machine for 2.0 candidate work. It is not a qualifying receipt. A smaller Volume-preview trial was also inconclusive and reverted.

## Next qualification

1. Attribute the reference-host renderer growth beyond short-run compositor cache warmup. Keep the original mixed Surface/Mesh/Volume and Project route in the acceptance test.
2. Repair a measured retention path, then pass the unchanged 800-switch and two-hour post-GC source budgets on a clean, identified reference build. Record raw peaks, GPU-process behavior, errors and context loss.
3. Run the exact installed candidate on the declared host with its package hash, upgrade and rollback evidence. A source run cannot replace this gate.

The original `scripts/release20-rc2-soak.mjs --run` and `scripts/check-release20-long-memory.mjs` remain strict tools for this later memory qualification. The 2.0 `scripts/release20-source-recovery.mjs --run` is a separate exact-freeze hard-exit and scientific recovery gate; its passing receipt cannot be used as a memory pass.

The 2.0 [roadmap evidence](../2.0.0/ROADMAP.md) remains the historical measurement record. These open results are a known release limit, not evidence of a passing local plateau.
