# Python Worker Protocol

This document defines the Electron main-process <-> Python subprocess protocol.

## Transport

- Line-delimited JSON over `stdin`/`stdout`.
- Optional binary payloads:
  - Request JSON may include `binary: [{ name, bytes }]`.
  - Raw bytes for those parts are written immediately after the JSON line.
  - Response JSON may include `binary: [{ name, bytes }]` followed by raw bytes.

## Request Envelope

```json
{
  "type": "mesh.generate",
  "jobId": "job-123",
  "...": "method-specific fields"
}
```

- `type`: request method.
- `jobId`: required correlation id.

## Response Envelope

Success:

```json
{
  "type": "version",
  "jobId": "job-123",
  "ok": true,
  "...": "method-specific fields"
}
```

Error:

```json
{
  "type": "error",
  "jobId": "job-123",
  "ok": false,
  "code": "WORKER_EXCEPTION",
  "message": "Human-readable summary",
  "details": { "trace": "..." },
  "error": {
    "code": "WORKER_EXCEPTION",
    "message": "Human-readable summary",
    "details": { "trace": "..." }
  }
}
```

## Supported Methods

- `ping` -> `pong` with `ok`, `version`, `protocol`
- `version` -> `version` with `ok`, `version`, `protocol`
- `health` -> dependency probe (`ok`, `version`, `protocol`)
- `mesh.generate` -> implicit mesh generation (CGAL)
- `mesh.transform` -> VTK mesh ops (`op`: `vtk_clean_normals` | `vtk_decimate` | `vtk_smooth`)
- `mesh.preview` -> VTK implicit preview mesh
- `geodesic.heat` -> geodesic heat path
- `volume.slice`
- `volume.isosurface`
- `volume.distance`
- `volume.streamlines`

## Versioning

- Worker version is currently `1.0.0`.
- Protocol version is currently `2026-03-15`.
- Main process validates worker availability at startup with `ping` + `version` + `health`.
