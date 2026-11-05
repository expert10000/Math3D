# SAGE-F07 bounded queue, cancellation and budgets — 2026-11-05

The Docker Sage service now admits at most two running jobs and four FIFO waiters. A waiter has a 10-second queue budget; a cancelled waiter leaves the queue without launching Sage. Duplicate IDs and a full queue return typed failures. Cancellation and the 30-second wall deadline stop the Sage process group, including descendants, before its temporary input, output and diagnostics directory is removed.

The worker rejects JSON input above 64 KiB and output or diagnostics above 256 KiB. Each Sage child has a 30-second CPU and 4 GiB address-space limit; the existing ideal standard/expanded profile can impose a shorter 15-second wall cap. `/health` reports the versioned worker policy, which Compute → Runtimes shows alongside the broker limits. Desktop and web Docker requests allow 45 seconds for the 10-second queue plus 30-second worker budget and response overhead.

**Acceptance:** `python -m unittest service.test_sage_adapter_f07 -v` passes on Windows (four tests, two POSIX-only cases skipped). The same six tests pass on WSL Ubuntu and in the rebuilt Sage 10.10 container. They verify wall and CPU termination, temporary cleanup, process-group termination of a descendant, queued cancellation without launch, full-queue rejection, queue-wait expiry, and input/output limits. The existing eight live Sage ideal tests pass in the rebuilt container. `/health` reports the policy and a real `sage.numberTheory.gcd(84,30)` returns `6` through `/run` under the new process limits. Renderer schema tests (5), TypeScript check, `build:main`, and `build:renderer` pass.

The F06 capability-manifest and F05 execution-certificate live tests pass against the rebuilt service. The B08 matrix was rerun with `--require-docker`: 16/16 local Sage 9.5 cases, Docker passed, zero differences.

The worker test substitutes a controlled Python child for a long Sage operation so deadline and descendant behavior are deterministic. The live GCD verifies real Sage startup and arithmetic under the limits; it is not a measured heavy-computation timeout. The bounded B08 Sage 9.5/10.10 comparison was already closed in [its live record](sage-b08-live-2026-11-05.md).

**Next:** SAGE-F08, the end-to-end real-backend regression suite covering UI, backend and reopened evidence.
