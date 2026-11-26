# Temporary hosted compute restart — 26 November 2026

This follows the [25 November temporary PC receipt](HOSTED_COMPUTE_TEMP_PC_RECEIPT_2026-11-25.md). The isolated, self-only `math3d-compute-preview` project is the only Pages project bound to the temporary compute origin. Production `math3d-app` remains unbound and hosted 2.0 remains **Limited**.

## Observed outage and recovery

- Windows reported its last boot at **09:22:26 Europe/Warsaw** on 26 November. After that boot, neither `127.0.0.1:8770` nor `127.0.0.1:8787` listened, the Docker Linux engine was unavailable, and no `cloudflared` process was running. The manual service starts from the previous day did not survive reboot.
- Docker Desktop, the two Sage Compose containers, the hosted Node/Python proxy, and the named Tunnel were restarted from the existing local configuration. The gateway now listens only on `127.0.0.1:8770` and Node only on `127.0.0.1:8787`; the Tunnel routes only the two compute API prefixes.
- A direct unsigned Tunnel worker diagnostics call returned JSON **401** `edge_token_required`. An unsigned preview Sage health call returned JSON **401** `session_required`. Production `app.math3dlab.com` still returned JSON **401** `access_required` for worker diagnostics and JSON **503** `compute_not_configured` for Sage health.
- A fresh session through the public preview Pages Function returned **200** and `authenticated:true`; Sage health returned **200** and `available:true`, advertising only `sage.numberTheory.gcd` and `sage.numberTheory.modInverse`. A fresh GCD(84, 30) call returned **200**, `success:true`, value `6`. These checks prove recovery of that narrow Pages → Tunnel → Node → Sage path.

## Reversible sign-in recovery

A current-user Windows Scheduled Task named **Math3D Temporary Compute Preview** now runs at interactive sign-in with limited privileges. Its action runs the local `start-on-logon.ps1` script under `%LOCALAPPDATA%\Math3D\hosted-compute-2.0` with `RemoteSigned` policy. The task stores no credential in its action. The script reads the existing restricted local secret file at run time, waits for the Docker Linux engine, starts the Sage Compose stack, starts Node only if port 8787 is unused, and starts the named Tunnel only if its configured process is absent. Startup status goes to `startup.log` in the same restricted directory; it does not log secret values.

The script was run once directly and once through Task Scheduler while the stack was online. The latter completed at **09:31:38 Europe/Warsaw** with `LastTaskResult=0`; the log recorded Sage, Node, and Tunnel startup checks without duplicates. This verifies the task action and idempotence, **not** a subsequent reboot. The task runs only after this Windows user signs in. It still depends on this PC, Docker Desktop, the hosted checkout, Python, local secrets, and the Tunnel credentials being available.

To disable automatic recovery, run `Disable-ScheduledTask -TaskName 'Math3D Temporary Compute Preview'`. To remove the task after the temporary test, run `Unregister-ScheduledTask -TaskName 'Math3D Temporary Compute Preview' -Confirm:$false`; the local script and service configuration can then be removed separately when the preview is retired. The restricted Cloudflare setup API token mentioned in the earlier receipt still needs manual removal or Cloudflare revocation because automatic approval review rejected its deletion.

## Remaining qualification

Chrome rendered the protected preview after recovery, but Computer Use could not reliably operate its controls (`coordinate input geometry is unavailable`, `unknown screenshotId`, and `call get_window_state before using this window`). A signed browser Mesh validate/repair POST through the Pages Function was **not** observed. The Cloudflare Access CLI also had no cached token for an independent signed API replay. Two-identity isolation, Project/source reopen, and broader hosted operation coverage remain open. No production compute binding or general public access was enabled.
