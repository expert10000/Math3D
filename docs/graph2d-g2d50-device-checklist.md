# G2D44–50 physical Graphs addendum

**Status — 2026-10-14:** Pending. No physical Android or iOS device was connected for this update. These cases extend the MOB-G13 evidence gate; automated G2D50 results do not fill them in.

Run both cases on each exact signed, embedded release artifact and physical device in the [MOB-G13 matrix](mobile-graphs-g11-g13-acceptance.md). Record the artifact hash, source commit, device/OS, tester, date, captures or video, displayed values, and any spoken accessibility output. Preserve the project used for save/reopen and handoff. A screenshot alone cannot establish undo, stale-result behavior, or the numerical value.

| Evidence case | Actions | Expected observations |
| --- | --- | --- |
| `polar-measurements` | Author `r(θ)=2*cos(θ)` on `[0,2π]`. Probe where the radius is negative. Measure swept area and arc length on `[0,π]`. Enter `[13,16.283185307]`, inspect the error and disabled actions, then restore the source angle range. | The probe retains θ and signed radius. Area is near π and arc length near 2π at the shown tolerance, with radians and source identity visible. Out-of-domain angles do not silently wrap or produce a result; the error and recovery action remain usable with large text and the platform screen reader. |
| `source-linked-constructions` | On `f(x)=x²−1`, save a point on the curve and its tangent or normal, then save the root near `x=−1` as a construction. Edit the source to `x²+1`, undo, save/reopen, and transfer the Graph through the normal desktop/mobile handoff. | The point/line resolve from the current source. The root construction becomes unavailable when its candidate disappears and returns after undo without changing its saved ID. Save/reopen and handoff retain construction intent and source references; no stale marker is presented as current. Record the construction list and plot at each stage. |

The case names above are mandatory on **every** physical MOB-G13 slot. The existing `keyboard-accessibility`, `workload-recovery`, `crash-log-review`, and professional feature cases remain separate and required. Desktop NVDA and mobile TalkBack/VoiceOver spoken walkthroughs remain pending until a tester records the actual output. The 1.6.0 test pack remains a frozen historical artifact; this addendum does not rewrite its manifest or past results.
