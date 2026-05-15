# Mobile App

React Native / Expo companion app target for Math3D.

Scope for the first version:

- scene gallery
- open and inspect saved scenes
- lightweight 3D preview workflow
- remote mesh generation through backend API

Not in first version:

- local CGAL or VTK compute
- full desktop authoring workspace

## Run

```bash
npm run dev:mobile
```

Or directly:

```bash
npm --prefix apps/mobile run dev
```

## Phase 5 Gate Helpers

From repo root:

```bash
npm run phase5:mobile:gate
npm run phase5:mobile:release-metadata
npm run phase5:mobile:device-runbook
```
