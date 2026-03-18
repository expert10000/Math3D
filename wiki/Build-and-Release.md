# Build and Release

## Core build

```bash
npm run build:core
```

## Desktop distribution

```bash
npm run dist
```

Also available:

- `npm run dist:ci`
- `npm run dist:dev`

## Python worker executable

```bash
npm run build:python-worker
```

Output:

- `build/python-worker-dist/worker.exe`

## Tests

```bash
npm --prefix renderer run test
npm run test:app:startup:smoke
npm run test:app:geometry:smoke
```

## GitHub releases

Push a semver tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Release workflow publishes installer assets for that tag.
