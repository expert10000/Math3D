# Private Sage gateway acceptance — 3 November 2026

The Phase 6 Number Theory slice was exercised against a real SageMath 10.10
container through the authenticated gateway. Electron desktop and local web
both used the `sage-private-gateway` backend in the shared `ExecutionService`.
The existing `sage-docker` route remained selectable.

## Deployed topology

`services/sage-gateway/docker-compose.yml` runs a gateway and Sage worker on
an internal Docker network. The gateway also joins an ingress network and
publishes only `127.0.0.1:8770` on the host. Docker inspection reported:

```text
worker.portBindings={}
gateway.portBindings={"8770/tcp":[{"HostIp":"127.0.0.1","HostPort":"8770"}]}
```

The worker therefore had no public direct endpoint. The separate local Docker
service at `127.0.0.1:8767` remained healthy with SageMath 10.10.

## Runtime and authorization

Authenticated gateway discovery reported `available=true`, SageMath `10.10`,
exactly two operations, and quotas of 2 concurrent jobs, 30 requests/minute,
and 20 seconds per run. An unauthenticated `GET /health` returned HTTP 401.
Browser requests to the same-origin web proxy carried no gateway credential;
the proxy and Electron main forwarded it server-side.

## Checks

- `npm run test:sage:gateway:unit`: authentication, operation allowlist, rate
  and concurrency quotas, forwarded cancellation, typed mathematical error,
  timeout, and output-size limit passed.
- `npm --prefix renderer test -- src/services/sageOperationExecution.test.ts src/integrations/sage/sageSchemas.test.ts`: 47 shared registry and schema tests passed.
- `npm run typecheck:noemit` and `npm run build:core` passed.
- `npm run test:sage:gateway:live`: web and desktop ran GCD and modular inverse,
  observed SageMath version and private runtime quotas, received a typed
  non-invertible diagnostic, cancelled a job, and saw the corresponding Compute
  records. Both also selected the existing local Docker backend.

This is a narrow gateway slice. Hosted web session authorization, per-user
quotas, remote resource blobs, broader worker federation, and release rollback
remain open Phase 6 gates.
