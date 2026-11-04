# SAGE-D03 norm, trace and embeddings — 2026-11-04

Selected D01 quadratic fields now offer **Norm, trace and embeddings** in CAS and Number Theory Operations. The input is a bounded element `u + v·a` with canonical integer power-basis coefficients from −4096 to 4096. The request carries the validated parent-before-child Project snapshot, including the pinned `QQ` and field revisions and hashes. The Sage worker reconstructs that exact field, computes norm and trace, and returns its degree relationship, basis and two exact symbolic embeddings. The core checks `N(u+va) = u²−buv+cv²`, `Tr(u+va) = 2u−bv`, both embeddings, and `1·2=2` before saving or importing evidence. The Inspector displays these values and checks.

**Acceptance:** For `K=QQ(a), a²−5=0`, local Sage 9.5 returns `N(1+a)=−4`, `Tr(1+a)=2`, embeddings `1±√5`, and base/relative/absolute degrees `1/2/2`. `N(1)=1` and `Tr(1)=2`. Core fixtures reject forged norm, noncanonical coefficients, and a changed pinned Project snapshot. A controlled desktop Sage HTTP response saves the typed result and independently reopens its evidence in a fresh profile. This controlled route does not close B08's live Docker Sage 10.10 comparison.

**Next:** SAGE-D04 bounded prime decomposition.
