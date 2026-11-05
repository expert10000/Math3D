# QI-22–24: Theory Lab runtime maturity

Implemented 2026-11-05 in the Theory Lab repository. Math3D's verified scene import and Project provenance remain unchanged; these items govern how Theory Lab selects and supervises the worker that creates source results.

- **QI-22:** A versioned host decision checks advertised operations against engines for the connected worker. The desktop backend shows unavailable reasons, supported scene viewer formats and possible engine alternatives. The submitted engine is never changed silently. Worker hello and capability versions must agree.
- **QI-23:** Local, SSH, WSL and Docker are explicit, mutually exclusive worker transports. They preserve the existing JSON-RPC job and cancellation semantics and check copied binary artifacts by declared size and SHA-256. Target identity is shown in worker status. SSH requires batch authentication and strict host-key checking; WSL and Docker use local runtime access.
- **QI-24:** Optional Dynamiqs registration requires a solved GPU probe against an analytic two-level answer. A fixed native/GPU benchmark reports tolerance, numerical and repeat-run error, device and timings. It reports speedup only after correctness and repeatability pass.

Verification: TypeScript checks and focused negotiation/transport tests passed. A WSL Ubuntu handshake, health check and resource request passed. The installed WSL Python 3.10 does not meet the worker's Python ≥3.11 requirement, so a full WSL job/artifact/cancellation run awaits a provisioned interpreter. Docker's daemon and the Dynamiqs GPU stack were unavailable on this host. The benchmark correctly reports no speed claim without a GPU.

The detailed configuration and acceptance commands are in Theory Lab's `docs/QI22_24_RUNTIME.md`.
