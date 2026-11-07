# M3D20-12 — Platform capability matrix

**Status:** implementation and test matrix for the current source tree, before a 2.0 release candidate. A build or a host facility probe alone does not certify an installed product. The status applies to the named journey, not to every tool in that module.

| Journey | Windows desktop | Local browser | Hosted browser | Android mobile | Linux package |
| --- | --- | --- | --- | --- | --- |
| Core Graph authoring, analysis, Project save/reopen | Full in tested source build | Full in tested local web build | Limited: deployment/storage unverified | Limited: supported Graph editor and Project preview; device matrix pending | Limited: packaging exists, installed journey unverified |
| Named Project import/export with verified source sidecars | Full in tested source build | Full in tested local web build | Limited: deployment/storage unverified | Limited: supported preview and resource subset | Limited: installed journey unverified |
| Geometry, Mesh, Surface, Volume native editors | Full for existing tested module slices; 2.0 integrated Study pending | Limited: browser-supported adapters and local workers only | Limited: browser adapters plus deployment/runtime policy | View-only or Limited by document; unsupported editor actions are not offered | Limited: installed journey unverified |
| Saved Workbooks, Notes and analysis evidence | Full for supported Project resources | Full for supported Project resources | Limited: persistence and deployment unverified | View-only for supported Project previews; source payload may be unavailable | Limited: installed journey unverified |
| Quantum/scientific external scenes | External runtime required for computation; saved views require verified source folders | Limited: external scene transport and source availability | External runtime required; hosted source and permission policy | View-only for supported Project previews, external scene verification limited | External runtime required; installed route unverified |
| Sage/CAS computation | External runtime required: probe local WSL/Docker/private route per operation | External runtime required: only configured authorized route | External runtime required: private authenticated gateway and quota | Unsupported for general Sage execution; saved evidence may be previewed | External runtime required; installed route unverified |
| Desktop native file dialogs and host filesystem | Full where bridge probe succeeds | Unsupported; browser file picker/download is a separate route | Unsupported; browser file picker/download is a separate route | Unsupported; Android picker/sandbox is a separate route | Limited: bridge source exists, installed package unverified |

`Full` means the row's described journey is supported by current implementation and the cited software test. `Limited` means only the stated subset or software path is covered. `View-only` permits inspection without an editor/computation promise. `External runtime required` requires a live, qualified runtime probe and may still be unavailable. `Unsupported` means this host does not offer that route. No status here certifies the 2.0 installer, a physical-device accessibility/performance gate, or universal browser/mobile parity.

## Evidence and boundaries

- Host facility facts come from `renderer/src/kernel/rendererPlatformCapabilities.ts` and `apps/mobile/src/services/mobilePlatformCapabilities.ts`. They report DOM, WebGL2, workers, storage, desktop bridges, network and touch separately. They do not infer scientific operation support from a runtime name.
- Desktop Project import/export and browser Project journeys use `renderer/src/projects/projectTransfer.ts`, the Project package validator, and the unified Projects acceptance tests. Required source sidecars must verify before full open; optional analysis caches can remain unavailable.
- Mobile named Project previews use `apps/mobile/src/models/mobileProjectPreview.ts` and `mobileProjectExplorer.ts`; document editing support varies by module and source shape. A preview is not a native editor. Mobile package resource checks are in `mobileProjectResources.ts`.
- Sage availability comes from the operation capability manifest and live backend probes shown in `renderer/src/features/computeCenter/SageRuntimeInspector.tsx`. A successful network probe or an installed binary alone is not a supported Sage operation.
- Windows source-build desktop and local browser can be exercised in CI. Hosted browser depends on the deployed gateway, credentials and storage. Android requires a rebuilt artifact and device evidence. Linux installer tests require the exact package. Until those checks run, their rows remain limited.

## Representative gate

Run the focused M3D20-12 journey cases listed in the roadmap: desktop and local browser Project/Graph import, save, reopen and refusal; mobile model import/export and view-only classification. Record exact commit, build, host and result. For hosted browser, Android device and Linux package, attach separate deployment or artifact evidence before promoting any row. The matrix is updated from observed evidence, not from a green type check alone.
