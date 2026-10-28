# SageMath Worker

Dockerized SageMath symbolic/exact backend for Math3D.

MATH3D's Symbolic Mathematics panel has an explicit **Local WSL / Docker service** selector.
Simplify, Factor, Expand, Solve, Gradient, Hessian, Singularities, polynomial factorization,
and exact roots support both choices. Local WSL is the default for those nine operations and uses the bounded desktop
worker or the same-machine web proxy. Matrix, Groebner, and number-theory operations
currently use Docker. The Docker polynomial roots endpoint works over the rationals;
choose Local WSL for algebraic root certificates. Switching backends does not start or
install either runtime automatically.

## Start

```powershell
docker compose -f services/sage-worker/docker-compose.yml up --build
```

Service URL:

- `http://127.0.0.1:8767`

## API

- `GET /health`
- `GET /operations`
- `POST /run`

`POST /run` accepts only predefined operations:

```json
{
  "operation": "sage.symbolic.simplify",
  "params": {
    "expression": "sin(x)^2 + cos(x)^2",
    "variables": ["x"]
  }
}
```

Result shape:

```json
{
  "engine": "sagemath",
  "operation": "sage.symbolic.simplify",
  "success": true,
  "latex": "...",
  "result": {},
  "warnings": []
}
```

## Supported operations

- `sage.symbolic.simplify`
- `sage.symbolic.factor`
- `sage.symbolic.expand`
- `sage.symbolic.solve`
- `sage.symbolic.gradient` (exact derivatives of a three-variable surface equation)
- `sage.symbolic.hessian` (exact second derivatives)
- `sage.symbolic.singularities` (isolated solutions of F = 0 and grad F = 0, at most 64)
- `sage.matrix.eigen_exact`
- `sage.matrix.charpoly`
- `sage.polynomial.roots_exact`
- `sage.polynomial.factor`
- `sage.groebner.compute`
- `sage.numberTheory.gcd`
- `sage.numberTheory.modInverse`
- `sage.topology.integer_homology` (strict canonical sparse-matrix payload only)

The Topology operation is intentionally not a source-code endpoint. It accepts only
the versioned Math3D canonical boundary-matrix schema, enforces cell/nonzero/integer
limits, verifies `d1*d2 = 0`, and returns compact integral groups, Smith diagonals,
SageMath version, and diagnostics.
