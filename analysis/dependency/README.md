# Dependency Analysis And Diagrams

This folder stores reproducible dependency analysis outputs generated with:

- `dependency-cruiser`
- `arkit`

## Generate Everything

```bash
npm run analyze:deps
```

## Generate Separately

```bash
npm run analyze:deps:depcruise
npm run analyze:deps:arkit
```

## Arkit Scoped Diagrams

```bash
npm run analyze:deps:arkit:renderer
npm run analyze:deps:arkit:electron
npm run analyze:deps:arkit:packages
npm run analyze:deps:arkit:apps
```

## Output Files

- `analysis/dependency/dependency-cruiser/report.err.txt`
- `analysis/dependency/dependency-cruiser/report.json`
- `analysis/dependency/dependency-cruiser/report.html`
- `analysis/dependency/arkit/renderer-architecture.puml`
- `analysis/dependency/arkit/electron-runtime-architecture.puml`
- `analysis/dependency/arkit/packages-architecture.puml`
- `analysis/dependency/arkit/apps-architecture.puml`

## Config Files

- `analysis/dependency/dependency-cruiser.cjs`
