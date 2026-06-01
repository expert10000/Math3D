# MATLAB Runtime Docker Bridge (PR1)

This integration adds a first Docker-based bridge from Math3D to a MATLAB Runtime-backed service.

Flow:

1. Math3D UI/renderer calls a TypeScript client.
2. The client sends HTTP to `matlab-runtime-service`.
3. The service calls a compiled MATLAB package (or a local NumPy fallback in dev).
4. The service returns JSON to Math3D.

MATLAB function targeted for compilation:

```matlab
function result = eig_demo(A)
    [V, D] = eig(A);

    result = struct();
    result.eigenvalues = diag(D);
    result.eigenvectors = V;
end
```

## Folder layout

```
integrations/
  matlab/
    docker/
      Dockerfile
      docker-compose.yml
      service/
        app.py
        requirements.txt
        matlab_adapter.py
      compiled/
        README.md
        eig_demo_package/
          .gitkeep
      examples/
        eig_request_2x2.json
        eig_response_2x2.json
```

## Start the service

From repository root:

```bash
docker compose -f integrations/matlab/docker/docker-compose.yml up --build
```

Default endpoint: `http://127.0.0.1:8765`

Health check:

```bash
curl http://127.0.0.1:8765/health
```

Eig demo:

```bash
curl -X POST http://127.0.0.1:8765/eig \
  -H "Content-Type: application/json" \
  -d @integrations/matlab/docker/examples/eig_request_2x2.json
```

## Compiled package placement

Put compiled MATLAB package files under:

`integrations/matlab/docker/compiled/eig_demo_package/`

The container reads:

`MATLAB_PACKAGE_PATH=/opt/math3d/matlab/eig_demo_package`

Do not commit large/binary compiled runtime outputs to git.

## Development fallback behavior

If the compiled package is not present, the service uses a NumPy fallback for `/eig` and reports this in `/health` via `mode: "numpy-fallback"` plus a `warning` field.
