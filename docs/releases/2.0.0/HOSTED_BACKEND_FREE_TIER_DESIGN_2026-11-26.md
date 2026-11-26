# Hosted backend design while staying on free plans

Status: **design for the isolated preview**, 26 November 2026. No paid service, production compute binding, or broader Access policy is part of this design. The public hosted 2.0 platform remains **Limited**. This builds on the [route runbook](HOSTED_COMPUTE_ROUTE_RUNBOOK.md), [temporary PC receipt](HOSTED_COMPUTE_TEMP_PC_RECEIPT_2026-11-25.md), and [restart receipt](HOSTED_COMPUTE_TEMP_PC_RESTART_2026-11-26.md).

## Current topology

```text
browser
  | static app and same-origin /api requests
Cloudflare Pages + narrow Functions
  | worker: Cloudflare Access assertion -> verified subject hash
  | Sage: separate short-lived web session cookie
  | both: encrypted edge credential, bounded request/timeout
Cloudflare Tunnel (outbound connector on this PC)
  | only /api/worker/* and /api/sage-private/*
Node proxy on 127.0.0.1:8787
  | worker jobs -> local Python / CGAL / VTK
  | Sage jobs -> gateway on 127.0.0.1:8770 -> private Sage container
  | durable Sage policy state -> restricted local file
```

The Pages Function authenticates and forwards; it does not execute CGAL, VTK, or Sage. Cloudflare's Workers Free CPU and memory limits make it unsuitable as the heavy compute host. The named Tunnel needs no inbound port on this PC. Keep the browser API at the Pages origin so the backend host can change without changing browser routes. Release installers and source archives remain direct GitHub Release assets.

## Free-plan budget and failure policy

| Resource | Current plan and design guard |
| --- | --- |
| Pages static assets | Static requests that do not invoke Functions are free and unlimited. Keep `/_routes.json` narrow so only the two compute API prefixes invoke Functions. The Free plan permits 500 builds per month, one at a time. |
| Pages Functions / Workers | Functions share the Workers Free allowance of 100,000 requests per account per UTC day; Free CPU is 10 ms and memory 128 MiB per invocation. This is an account allowance, not a Math3D user count. The compute routes must fail closed on exhaustion, returning Cloudflare error 1027 rather than bypassing authorization. |
| Cloudflare Access | The preview policy currently allows **one owner identity**. Adding users requires an explicit policy change and two-identity isolation tests. GitHub Release downloads and GitHub sign-in do not grant compute access. Check the then-current Access plan before inviting more users; do not infer enrollment from the free-tier ceiling. |
| Tunnel and host | The temporary PC supplies CPU, memory, disk, electricity, internet, Docker, Node, Python, and Sage. Cloudflare does not supply a persistent Sage/CGAL machine here. A reboot, sign-out, PC sleep, Docker failure, or network outage makes compute unavailable even when the static app stays online. The sign-in task starts only after the owner logs in and has not yet passed a subsequent reboot test. |
| Cost control | Keep the Cloudflare account on Free and do not enable Workers Paid, a paid compute host, or metered storage. A free cloud invoice does not make the PC's power, connectivity, or domain free. Check usage before increasing traffic. There is no verified always-on, zero-cost replacement host in this design. |

Sources checked on 26 November 2026: [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Workers limits and fail modes](https://developers.cloudflare.com/workers/platform/limits/), and [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/).

## Host and data boundaries

- Run one Node proxy on loopback, one Python worker pool, one Sage gateway and worker Compose stack, and one Tunnel connector for this preview. The existing hosted proxy admits ten worker POSTs per subject per minute; Sage admits one concurrent job and ten runs per user per minute; the gateway also has global limits. Process-local worker counters and jobs are acceptable only for this single-process preview. Do not add replicas until shared admission and job state exist.
- Keep the Pages edge token, Access audience, Sage session secret, gateway bearer credential, and per-user Sage keys out of Git and browser bundles. The Tunnel hostname must reject calls without the edge token, including direct calls that bypass the Pages Function. Restrict the Tunnel to the two API prefixes; unknown paths return 404. Rotate temporary setup credentials after use.
- Store Sage revocation/quota state in a persistent, access-restricted file and back it up before moving hosts. Jobs may be transient and should fail visibly after a host restart. Projects and source packages currently use the browser's local persistence/export path; the compute proxy is **not** a cloud Project database. A server-side Project library, shared scenes, and cross-device recovery need a separately designed authenticated storage service and lifecycle.
- The Sage gateway currently exposes only `sage.numberTheory.gcd` and `sage.numberTheory.modInverse`. The signed preview browser has passed Mesh CGAL validate and repair; this does not imply broad Algebra/CAS or every VTK/volume operation is hosted.

## Path to a durable backend

The next host should be a dedicated, always-on Linux machine with enough CPU/RAM for the actual CGAL/VTK/Sage workload, persistent disk, Docker/Compose, Python, Node, a service manager, backup, and monitoring. This can be a machine the owner already has; no new provider is selected here. Deploy the exact reviewed source revision, pin dependency/image versions, and preserve the same loopback ports and public API paths. Run the named Tunnel as a supervised service and keep host ports closed. Use a distinct production edge credential, Sage session secret, users, and state file from preview. Set the production Sage origin explicitly and bind production Pages only after acceptance.

Migrate in order: (1) start a separate candidate host and verify local worker/Sage operations; (2) verify direct-origin denial, per-user quotas, restart and data recovery; (3) attach a **separate preview Tunnel/hostname** and repeat signed Pages browser operations; (4) run two independent identities, async job ownership/cancel, Sage revocation across restart, outage/recovery, Project/source reopen after browser restart, and applicable scene/permission/layout/locale/offline gates; (5) record deployed byte identity and only then consider production binding and claim changes. Preserve the old preview as rollback until the new route is qualified. Avoid adding a second active proxy against one Sage policy file.

## Immediate work on the free setup

1. Verify the sign-in task after a real reboot and add a visible health check for the owner. The prior reboot proved manual starts were not durable. Keep production unbound while the PC is the only compute host.
2. Make the preview offer a clear Cloudflare Access sign-in/reauth link when worker health redirects to Access; keep Access enforcement unchanged. An anonymous background fetch currently appears as `Failed to fetch` in the browser.
3. Finish signed preview tests for async jobs, two identities, public Pages outage/recovery, and Project/source save and reopen after browser restart. Record which operations and source bytes passed.
4. Manually remove or revoke the temporary Cloudflare setup API token. Automatic approval review rejected deleting its local copy, so this step remains with the owner.

Until these gates and a durable host are available, keep `math3d-app` production Functions unbound, the preview policy self-only, and hosted compute marked **Limited**.
