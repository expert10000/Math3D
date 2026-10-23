# GRA-14 packaged desktop acceptance — 2026-10-24

## Measured package and machine

- Package: `output/gra14-desktop-package/win-unpacked/Math3D Dev.exe`, built with `electron-builder --win --dir` from app build identity `a0d04003b076cd7412effb8e2fc0f6e8d0509b52` (1.5.0, renderer hash `5b7a9ddb…`). The build identity records an existing dirty working tree; this test does not claim a clean release build.
- Packaged `resources/app.asar` SHA-256: `e6b4afff99baed09d5ae23a0c4daa02d6816eaf0b7e5b0b1cef56e5c041f36`.
- Host: ASUS desktop, Windows 11 Pro build 26200, Intel Core i9-12900K, 128 GB RAM. The active WebGL renderer in the hardware runs was ANGLE / Intel UHD Graphics 770 / Direct3D 11. An NVIDIA RTX 3080 is also installed, but these measurements do not exercise it.
- Method: launch the packaged executable through Playwright with an isolated profile and `MATH3D_GPU_MODE=hardware`; set a 1440 × 900 content viewport, request 8 × 8 × 8 arrows, wait for “512 of 512 bounded samples” and two animation frames. Four fresh launches, three render requests per launch; the fourth launch was part of the full six-journey packaged suite. The 5,000 ms ceiling applies to each measured render request, not cold startup.

| Fresh launch | First stable-frame measurements | Median | Reported WebGL renderer |
| --- | --- | --- | --- |
| 1 | 123, 134, 99 ms | 123 ms | Intel UHD 770, D3D11 |
| 2 | 133, 135, 118 ms | 133 ms | Intel UHD 770, D3D11 |
| 3 | 137, 133, 101 ms | 133 ms | Intel UHD 770, D3D11 |
| 4 | 130, 167, 102 ms | 130 ms | Intel UHD 770, D3D11 |

**Automated desktop gate: passed on this PC.** The packaged 3D suite passed all six journeys in hardware mode, covering source verification and changed/missing bundle bytes, document editing and glyph budget, trajectory stop reports, Project reopen, Cancel without partial output, resize, camera interaction, keyboard access and accessibility-tree status text.

The earlier software-renderer measurements were 120/186/117 ms and 139/201/151 ms (SwiftShader). They are kept distinct from the hardware result.

## Spoken Narrator review — pending human observation

An accessibility tree and ARIA roles show text exposed to assistive technology; they cannot establish what Narrator actually speaks. A person using the package should record their name/date, Windows/Narrator version and pass/fail notes for each item below. Do not mark this gate passed from automated results.

1. Start Narrator, open the packaged app, navigate to **Graphs → More → 3D vector field editor** by keyboard. Confirm the dialog title is spoken, focus enters the dialog, and P/Q/R component labels, axes, units, seed controls and solver controls are understandable in reading order.
2. Use a copied `vortex-volume.sscene` bundle, save a scientific field reference, then make the copy missing or change its bytes before **Verify & render arrows**. Confirm the error is spoken as an alert, identifies the source problem, and no stale arrows are presented. Restore the copy and confirm a fresh successful status is spoken.
3. Add a seed and run trajectories. Confirm Narrator speaks the progress status and the completed seed's stop reason, accepted/rejected steps, evaluations, time/arc units and tolerance text without requiring a mouse.
4. Start a sufficiently long run, reach **Cancel run** by keyboard and activate it. Confirm Narrator speaks the Cancel control and “cancelled; no partial result was published”; confirm the run button becomes available again. If the run finishes before Cancel can be reached, record the item as untested and retry with a longer workload.
5. Orbit and resize the 512-glyph viewer with keyboard controls. Confirm camera status remains readable and focus returns to the Graphs menu after Escape.

Reviewer: **pending**. Date: **pending**. Spoken review result: **pending**. Any failed announcement should include the exact control, expected phrase and phrase actually heard.

The separate Android viewer has not been implemented; Android performance is outside this desktop gate.
