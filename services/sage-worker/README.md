# SageMath Worker

Dockerized SageMath symbolic/exact backend for Math3D.

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
- `sage.matrix.eigen_exact`
- `sage.matrix.charpoly`
- `sage.polynomial.roots_exact`
- `sage.polynomial.factor`
- `sage.groebner.compute`
- `sage.numberTheory.gcd`
- `sage.numberTheory.modInverse`
