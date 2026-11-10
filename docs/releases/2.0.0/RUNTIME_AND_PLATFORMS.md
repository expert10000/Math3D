# Runtime help and platform differences

Start with the [first-run Project guide](FIRST_RUN_PROJECT_STUDY.md) for a journey that uses built-in data. For a computation or import that does not work, identify the **operation**, **host**, and **source** before changing settings. A host facility probe, an installed runtime, and support for a particular scientific operation are three different checks.

In the desktop app, open **Compute Center → Overview** for the Runtime Center summary, then **Open route diagnostics** for operation-specific Sage and broker admission. A route marked **checking** has not returned a fresh probe; **limited** means the route responded but advertised no supported operations. The Docker manager and the Sage Docker operation route have separate status. An installed Python route is marked ready only when the running executable has the exact packaged worker path, stays inside packaged resources after link resolution, and is hashed; a source script or override is identified separately. Worker exit revokes readiness until a successful startup check. Failed broker probes and duplicate backend IDs appear separately from usable routes, and disposed services unregister their probes. The Sage operation selector includes unsupported catalog entries and their route-specific reasons. The Jobs panel records broker attempts and source generation for this app session, ignoring reordered or cross-source events; it displays a Result ID only when its producer attaches one. **Export capability receipt** uses a probe at most 60 seconds old and downloads a bounded JSON snapshot of route states, advertised operations, artifact hash, discovery-failure counts and structured job outcomes. Older probes refresh on the first click; a second click downloads the receipt. It aliases job and backend IDs and omits freeform diagnostics and source IDs. A completed job still needs its saved Result's source and mathematical checks.

## Choose the matching route

| Host | Available route | What to check first |
| --- | --- | --- |
| Windows desktop installer | Bundled `resources/python-worker/worker.exe` for supported worker operations; desktop file dialogs for supported imports. | Confirm the exact installed build and worker resource. End users should not need a separate Python installation for bundled operations. The 2.0 installer still requires [candidate signoff](INSTALL_UPGRADE_GATE.md). |
| Desktop from source | Python script worker by default; an explicitly built worker executable is optional. | Install the pinned worker requirements and check the selected backend. See [worker runtime resolution](../../python-worker-runtime.md). |
| Local browser | Browser UI plus a local `/api/worker` proxy for worker operations. | Confirm that the proxy is running with a configured worker backend, WebGL2 and persistent storage. Browser file pickers are used instead of desktop native dialogs. |
| Hosted browser | Deployed browser UI and only configured, authorized server routes. | Check deployment, storage policy, network and operation-specific backend access. Local WSL/Docker processes on the visitor's computer are not implied. |
| Android mobile | Supported native Graph and Project preview subset. | Check the document's advertised actions and required resources. A preview is not a promise of a desktop editor or general Sage execution. |
| Linux package | Source and packaging routes exist; exact installed 2.0 journey is pending. | Do not infer parity from a successful build. Qualify the specific package and operation first. |

The [capability matrix](PLATFORM_CAPABILITIES.md) lists journey-level support and current evidence. Status may be **Full**, **Limited**, **View-only**, **External runtime required**, or **Unsupported** for a particular host and task.

## Diagnose the symptom

| Symptom | Check and recovery |
| --- | --- |
| Project cannot be saved or fully opened | Check whether local persistent storage is available. In a browser, allow site storage and avoid a temporary/private profile for durable work. If an imported Project lacks a required source sidecar, inspect its compatibility preview and import the complete package/resources; do not force a partial edit. |
| Canvas or 3D view is unavailable | Check WebGL2 availability and browser/graphics driver support. A desktop bridge, worker, or network connection cannot substitute for a missing graphics context. Keep the saved Project and try a supported viewer on another qualified host. |
| Worker operation cannot start on installed Windows app | Check that the installed `resources/python-worker/worker.exe` exists. Record the app version, operation, error and worker startup message. The release gate runs the worker with Python/Conda removed from `PATH`; an installed 2.0 build without that passing evidence is not qualified. |
| Worker operation fails in source or local browser mode | Confirm the selected worker mode and backend path, then run the focused worker smoke from [run modes](../../install-and-run-modes.md). Source runs default to Python script; local browser needs a proxy backend. An available worker process still needs to advertise the requested operation. |
| Sage/CAS action is unavailable | Open the Sage runtime inspector and probe the specific Local WSL, Docker, or private gateway route. Check the operation's capability, engine version, and authorization. A reachable backend may support one operation and reject another. On mobile, general Sage execution is unsupported. |
| Saved quantum or scientific scene does not reopen | Reattach or relink the exact `.qscene` or `.sscene` source folder. Math3D re-verifies its fingerprint and bytes. A moved, missing, or changed folder stays unavailable until an exact copy is supplied; a matching title is insufficient. |
| Saved result shows stale, missing, or unavailable | Open the result's source and resource status. Recompute only from a current source, or restore the exact source/artifact. Keep historical evidence as historical; see [scientific conventions](SCIENCE_CONVENTIONS.md). |

## Developer diagnostics

For a source checkout, `MATH3D_WORKER_MODE=auto|python|exe` selects the worker route. `MATH3D_PYTHON`, `MATH3D_WORKER_EXE`, and `MATH3D_WORKER_SCRIPT` are explicit path overrides. Main-process logs record the selected backend, launch command, mode source, packaged state, and startup check. The packaged default is the bundled executable; changing an override is a diagnostic action, not a substitute for a qualified release build. The [install and run modes](../../install-and-run-modes.md) guide has exact local commands.

When reporting a failure, include the app version, OS and host mode, operation name, whether the source is current, the displayed error, and whether the required resource is present. Do not include private gateway credentials or Project data that you do not intend to share.
