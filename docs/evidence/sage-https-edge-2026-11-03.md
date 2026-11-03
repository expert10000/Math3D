# Sage HTTPS edge restart gate — 3 November 2026

A disposable HTTPS reverse proxy served the production `apps/web/dist` bundle
and forwarded `/api/sage-private/*` to a hosted web proxy bound to loopback.
The test used a short-lived self-signed certificate and the live SageMath 10.10
gateway. Two separate Chromium contexts connected as different users with
Secure, HTTP-only, SameSite=Strict cookies.

The first run exposed a policy gap: the first user's signed session stayed
valid after the web proxy restarted, but its in-memory request counter reset.
The same user received HTTP 200 after reaching the pre-restart limit, where
the gate expected HTTP 429. The hosted web proxy now requires an absolute path
to a durable policy file. It stores per-user request times, active job leases,
login attempts, and revoked session nonces without storing access keys or the
gateway credential. Policy writes use a temporary file and rename.

The rerun passed. One user received `user_rate_limited` before and after the
proxy restart, while the other continued to run GCD and modular inverse. A
validly signed expired cookie received `session_required` (HTTP 401). A cookie
revoked by logout remained rejected after another proxy restart. The web UI
also showed the private capability and SageMath version; a non-invertible
modular inverse produced `operation_failed`; cancellation and the failure
appeared in Compute diagnostics.

## Checks

- `npm run test:sage:edge:live`: production bundle built and one HTTPS
  edge test passed with two independent browser contexts and two proxy restarts.
- `npm run test:sage:hosted:unit`: five tests passed, including durable quota,
  active lease, revoked-session behavior across process recreation, and refusal
  to bind the hosted proxy to a non-loopback address.
- `npm run test:sage:hosted:live`: one two-user web test passed.
- `npm run test:sage:gateway:live`: two web and desktop tests passed, including
  the unchanged local Docker route.
- `npm run typecheck:noemit` and `git diff --check`: passed.

The worker container's Docker host port bindings remained `{}` and it joined
only `sage-gateway_private-sage`. The gateway published only
`127.0.0.1:8770`. Hosted mode rejects a web proxy listening on a non-loopback
address, and the edge harness started it on `127.0.0.1:8797`. Thus neither
math worker nor web proxy had a direct public listener in this gate.

The in-memory policy was insufficient across restarts. The durable file makes
one proxy process restart-safe. It does not provide atomic quotas across
multiple replicas; a production multi-replica deployment needs a shared
transactional store. This test was a local HTTPS edge simulation, not an audit
of an externally deployed reverse proxy or firewall.
