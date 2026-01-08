# electron/py/api.py
import sys, json, math
import numpy as np

def laplace2_free(xi, L, n):
    """Green's function for Laplace on R²: G = -(1/2π) log|x-ξ|"""
    x = np.linspace(-L, L, n)
    y = np.linspace(-L, L, n)
    X, Y = np.meshgrid(x, y)
    R = np.sqrt((X - xi[0])**2 + (Y - xi[1])**2)
    # Avoid log(0)
    R[R < 1e-9] = 1e-9
    G = -(1/(2*math.pi)) * np.log(R)
    return x.tolist(), y.tolist(), G.tolist(), {"kind": "laplace2_free", "xi": xi, "n": n, "L": L}

def rect_dirichlet(a, b, xi, n, N):
    """Rectangle (0,a)x(0,b) Dirichlet: truncated series."""
    x = np.linspace(0, a, n)
    y = np.linspace(0, b, n)
    X, Y = np.meshgrid(x, y)
    G = np.zeros_like(X)
    for m in range(1, N + 1):
        for n_ in range(1, N + 1):
            lam = (m * math.pi / a)**2 + (n_ * math.pi / b)**2
            phi = (2 / math.sqrt(a * b)) * np.sin(m * math.pi * X / a) * np.sin(n_ * math.pi * Y / b)
            phi_xi = (2 / math.sqrt(a * b)) * math.sin(m * math.pi * xi[0] / a) * math.sin(n_ * math.pi * xi[1] / b)
            G += (phi * phi_xi) / lam
    return x.tolist(), y.tolist(), G.tolist(), {
        "kind": "rect_dirichlet", "a": a, "b": b, "xi": xi, "n": n, "N": N
    }

def main():
    data = json.load(sys.stdin)
    kind = data.get("kind")
    if kind == "laplace2_free":
        xi = data.get("xi", [0, 0])
        L  = float(data.get("L", 1.5))
        n  = int(data.get("n", 151))
        x, y, z, meta = laplace2_free(xi, L, n)
    elif kind == "rect_dirichlet":
        a = float(data.get("a", 1))
        b = float(data.get("b", 1))
        xi = data.get("xi", [0.5, 0.5])
        n  = int(data.get("n", 121))
        N  = int(data.get("N", 60))
        x, y, z, meta = rect_dirichlet(a, b, xi, n, N)
    else:
        raise ValueError(f"Unknown kind {kind}")
    print(json.dumps({"x": x, "y": y, "z": z, "meta": meta}))

if __name__ == "__main__":
    main()
