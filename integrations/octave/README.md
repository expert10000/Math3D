# Octave Docker Bridge (MATLAB-like)

This integration adds a free, MATLAB-like backend based on GNU Octave.
It is not full MATLAB compatibility, but it enables a direct Math3D -> HTTP -> Octave workflow.

## What it provides

- `GET /health` for runtime availability.
- `POST /eig` for eigenvalue/eigenvector demo on square numeric matrices.
- `POST /solve` for linear solve demo (`A\b`).
- Dockerized service (no MATLAB license required).

## Start the service

From repository root:

```powershell
docker compose -f integrations/octave/docker/docker-compose.yml up --build
```

Service URL:

- `http://127.0.0.1:8766`

## API

### `GET /health`

Returns:

```json
{
  "status": "ok",
  "engine": "gnu-octave",
  "available": true
}
```

### `POST /eig`

Request:

```json
{
  "matrix": [
    [1, 2],
    [3, 4]
  ]
}
```

Response shape:

```json
{
  "ok": true,
  "engine": "gnu-octave",
  "inputShape": [2, 2],
  "eigenvalues": [-0.3722813232690143, 5.372281323269014],
  "eigenvectors": [
    [-0.8245648401323938, -0.41597355791928425],
    [0.5657674649689923, -0.9093767091321241]
  ],
  "elapsedMs": 18
}
```

Examples are included under `integrations/octave/docker/examples`.

### `POST /solve`

Request:

```json
{
  "matrix": [
    [3, 1],
    [1, 2]
  ],
  "rhs": [9, 8]
}
```

Response shape:

```json
{
  "ok": true,
  "engine": "gnu-octave",
  "inputShape": [2, 2],
  "solution": [2, 3],
  "residualNorm": 0,
  "elapsedMs": 15
}
```
