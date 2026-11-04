# Private Sage gateway — Number Theory slice

This deployment exposes only `sage.numberTheory.gcd` and
`sage.numberTheory.modInverse`. The gateway requires a bearer credential for
discovery, execution, and cancellation. Electron main or the same-machine web
proxy sends that credential; the renderer never receives it. All requests use
the existing Sage `ExecutionService` registry, Inspector cards, and Compute
job diagnostics.

## Start

Set a random credential of at least 32 characters in the process environment:

```powershell
$env:MATH3D_SAGE_GATEWAY_TOKEN = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
docker compose -f services/sage-gateway/docker-compose.yml up -d --build
```

The gateway listens at `http://127.0.0.1:8770`. Set
`MATH3D_SAGE_GATEWAY_URL` and `MATH3D_SAGE_GATEWAY_TOKEN` in the desktop or web
server process before starting Math3D. The URL may point to a remote HTTPS
gateway; plain HTTP is accepted only on loopback. In Number Theory Services,
choose **Private gateway**. **Docker service** remains a separate local choice.

The gateway worker joins only an internal Docker network and has no published
port. The gateway joins that network and a separate ingress network, with its
host port bound to loopback. Confirm the deployment:

```powershell
docker ps --filter name=sage-gateway --format '{{.Names}} {{.Ports}}'
curl.exe -i http://127.0.0.1:8770/health
```

The gateway should publish `127.0.0.1:8770->8770/tcp`, while its worker shows
only container ports. The unauthenticated health request returns HTTP 401.

## Contract and limits

- `GET /health`: authenticated capability and Sage version discovery; lists
  only the two Number Theory operations.
- `POST /run`: validated integer parameters and job ID; returns the normal
  Sage response. A mathematical failure includes `errorCode: operation_failed`.
- `POST /cancel`: forwards cancellation for an active gateway job.
- Errors have a stable `code` and `error` message, including `unauthorized`,
  `invalid_input`, `rate_limited`, `concurrency_limited`, `cancelled`,
  `timed_out`, `output_too_large`, and `worker_unavailable`.

The gateway enforces 8 KiB input, 256 KiB output, 2 concurrent jobs, 30
requests per minute, and a 20 second run timeout. The worker container is
limited to 1 GiB memory and 128 processes. Audit output records job ID,
operation, outcome, and elapsed time without input values or credentials.

## Verify

With both the gateway and the existing local Docker service running:

```powershell
npm run test:sage:gateway:unit
npm run build:core
npm run test:sage:gateway:live
```

The live suite runs GCD and modular inverse through the gateway on web and
desktop, verifies typed mathematical errors, cancellation, runtime quotas,
Compute diagnostics, an unauthenticated 401, and the unchanged local Docker
choice. The gateway is a narrow Phase 6 slice. Hosted web session auth,
per-user quotas, authenticated blob resources, and broader worker federation
remain future gates.

The [acceptance record](../../docs/evidence/sage-private-gateway-2026-11-03.md)
includes the deployed port-binding check and live desktop/web results.

## Hosted web sessions

The web proxy can authorize separate browser users while keeping the gateway
credential on the server. Run the proxy on loopback behind an HTTPS reverse
proxy. Route `/api/sage-private/*` from the same public origin as the web app
to the proxy. Configure these variables in the web proxy process:

```text
MATH3D_SAGE_WEB_AUTH_MODE=hosted
MATH3D_SAGE_WEB_ORIGIN=https://math.example.org
MATH3D_SAGE_WEB_SESSION_SECRET=<random secret of at least 32 characters>
MATH3D_SAGE_WEB_USERS_JSON=[{"id":"ada","accessKey":"<unique random key of at least 32 characters>"}]
MATH3D_SAGE_WEB_STATE_FILE=<absolute path to a durable, access-restricted policy JSON file>
MATH3D_SAGE_GATEWAY_URL=https://<private gateway hostname>
MATH3D_SAGE_GATEWAY_TOKEN=<gateway bearer credential>
```

The web proxy's listening host must remain loopback. The HTTPS reverse proxy
must terminate TLS and should forward only the intended same-origin routes.
Each user enters their assigned access key in **Compute → Runtimes**. The
proxy exchanges it for an eight-hour HTTP-only, Secure, SameSite=Strict cookie;
the key is cleared from the UI after exchange. Each user is limited to one
concurrent Sage job and ten run requests per minute. The proxy binds cancel to
the user who started the job. Invalid or expired sessions, quota failures, and
cross-session cancellations return typed errors. The gateway's global quotas
continue to apply. The policy file stores rate counters, active job leases,
login attempts, and revoked session nonces across a proxy restart; it contains
no access keys or gateway credential. Use a persistent volume, restrict file
access to the proxy account, and keep one proxy process per policy file.
Distributed quota storage and identity-provider integration are later gates.

Run `npm run test:sage:hosted:unit` and, with the gateway and Docker route
running, `npm run test:sage:hosted:live`. The hosted test uses two independent
browser contexts and test-only access keys. The desktop route keeps its own
gateway credential in Electron main and needs no hosted web session.

`npm run test:sage:edge:live` builds the production web bundle and runs the
local HTTPS edge gate. It needs OpenSSL to create a short-lived test certificate.
The test exercises two browser sessions, typed errors, cancellation, diagnostics,
expiry, quotas and revocation across a proxy restart. The reverse proxy and
certificate in this test are disposable; verify the actual deployment edge
separately before public access.
