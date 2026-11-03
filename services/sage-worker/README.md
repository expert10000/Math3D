# SageMath Worker

Dockerized SageMath symbolic/exact backend for Math3D.

MATH3D's Symbolic Mathematics panel has an explicit **Local WSL / Docker service** selector.
Simplify, Factor, Expand, Solve, Gradient, Hessian, Singularities, polynomial factorization,
and exact roots support both choices. Local WSL is the default for those nine operations and uses the bounded desktop
worker or the same-machine web proxy. Matrix, Groebner, number-theory, and bounded algebra-object reconstruction operations
currently use Docker. The Docker polynomial roots endpoint works over the rationals;
choose Local WSL for algebraic root certificates. Switching backends does not start or
install either runtime automatically.

## Local WSL setup on Windows

Install Ubuntu with WSL, then install a SageMath Conda environment inside Ubuntu.
The desktop worker probes `/usr/bin/sage`, `/usr/local/bin/sage`, and a named
`sage` environment under Miniforge, Mambaforge, or Miniconda in the default
Linux user's home directory. It runs Sage only for an explicit computation.

```powershell
wsl --install -d Ubuntu
```

Inside Ubuntu, install Miniforge and create the environment:

Use the [Miniforge installer](https://github.com/conda-forge/miniforge#install)
and the [SageMath installation guide](https://doc.sagemath.org/html/en/installation/index.html)
for the current installer steps. Then run:

```bash
conda create -n sage -c conda-forge sage python=3.12
~/miniforge3/envs/sage/bin/sage --version
```

If the distribution is named differently, set `MATH3D_WSL_DISTRO` before
starting Math3D. A cold WSL startup can take up to a minute; the app reports
missing Sage or WSL startup failures through its local health check.

## Start

```powershell
docker compose -f services/sage-worker/docker-compose.yml up --build
```

Service URL:

- `http://127.0.0.1:8767`

Run the opt-in browser qualification against the real service:

```powershell
npm run test:sage:live-docker
```

The test runs Simplify, both matrix operations, Gröbner basis, GCD, and modular
inverse in Surface Services, then runs Gröbner basis in Geometry Services. It
checks exact results, a non-invertible modular-inverse diagnostic, and the
corresponding successful and failed Compute jobs. It does not mock `/run`.

The Number Theory workspace has focused live Docker checks on both platforms:

```powershell
npx playwright test --config playwright.sage-live-docker.config.ts --grep 'web Number Theory runs'
npx playwright test --config playwright.sage-live-desktop.config.ts --grep 'live desktop Number Theory runs'
```

These checks run GCD and modular inverse with the workspace defaults (84 and 30,
then 3 modulo 11), verify the exact results in Inspector, and confirm the
reported SageMath version and completed Compute jobs. They contact the real
service on `127.0.0.1:8767` without intercepting its requests.

## API

- `GET /health`
- `GET /operations`
- `POST /run`

`POST /run` accepts only predefined operations:

`sage.algebra.reconstruct` accepts a versioned `math3d.sage-algebra-reconstruction` snapshot of A01 object records in parent-before-child order. The worker checks each exact definition hash and parent revision before constructing `ZZ`, `QQ`, `Z/nZ`, canonical finite fields, or polynomial rings. The request is limited to 32 KiB and 32 objects; finite-field cardinality is capped at 65,536 and polynomial rings at eight variables. It returns structured exact metadata, not a serialized Sage object. No user-provided Sage or Python source is evaluated. Local WSL and the private gateway do not advertise this operation yet.

`sage.algebra.inspectDomains` accepts two validated reconstruction snapshots from the same Project, up to 60 KiB combined. It returns each pinned parent descriptor (kind, characteristic, field/commutativity/exactness, coefficient-domain reference, variables and monomial order) and checks Sage's canonical coercion in both directions. A canonical map has a deterministic reference tied to both object revisions and definition hashes. A missing map returns `NO_CANONICAL_COERCION` with source and target characteristics; an indeterminate Sage check returns `COERCION_CHECK_FAILED`. It does not assume that abstractly isomorphic parents can be coerced. This operation is currently Docker-only in the application.

On a machine with Sage installed, the constructor and script entry point can be checked with:

```bash
cd services/sage-worker
sage -python -m unittest service.test_algebra_reconstruction -v
```

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
