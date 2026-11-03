# Hosted Sage web session acceptance — 3 November 2026

The hosted web proxy was exercised against the live SageMath 10.10 private
gateway. It accepted two independent browser sessions with distinct
deployment-assigned access keys. Compute → Runtimes showed each connected user,
the session expiry, and that user's one-concurrent / ten-requests-per-minute
quota. Both sessions discovered the private runtime through the shared Sage
`ExecutionService` and ran Number Theory operations.

The first session ran GCD, consumed its request allowance, and received the
typed `user_rate_limited` response. The second session continued to run GCD
and modular inverse. Its non-invertible input produced `operation_failed` in
Inspector; cancellation and the failure appeared in Compute diagnostics.
Browser requests carried no gateway bearer credential. The session cookie was
HTTP-only. Logging out the first session made its subsequent gateway health
request return `session_required` (HTTP 401), while the second session stayed
active. The session policy unit tests also covered cookie expiry, revocation,
origin rejection, independent quotas, and cross-user job ownership.

## Checks

- `npm run test:sage:hosted:unit`: 3 tests passed.
- `npm run test:sage:hosted:live`: 1 browser test passed with two independent contexts.
- `npm run test:sage:gateway:live`: 2 tests passed for web and Electron desktop,
  including GCD, modular inverse, typed failure, cancellation, diagnostics,
  and the existing local Docker option.
- `npm run typecheck:noemit`: passed after fixing the exhaustiveness case for
  the saved Mesh comparison anchor introduced by the fetched main commits.
- `git diff --check`: passed.

Docker inspection of `sage-gateway-sage-worker-1` reported empty host port
bindings (`{}`) and only the `sage-gateway_private-sage` internal network.
`docker ps` reported `127.0.0.1:8770->8770/tcp` for the gateway and container
ports only for the worker. The worker had no public direct endpoint.

This gate uses one loopback web proxy behind an HTTPS reverse proxy. Per-user
quotas and revoked sessions live in that process. Identity-provider
integration, durable shared quota storage, and production edge deployment
verification remain open.

The later [HTTPS edge restart gate](sage-https-edge-2026-11-03.md) found the
restart gap and added a required durable policy file for a single proxy.
