from typing import Any, Dict, Tuple

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla

from .mesh_ops import (
    barycentric_to_point,
    build_cotan_laplacian,
    build_face_adjacency,
    build_mass_diag,
    face_geometry,
    factorize_pinned_laplacian,
    mean_edge_length,
    mesh_hash,
    point_barycentric,
)


class HeatCache:
    def __init__(self, V: np.ndarray, F: np.ndarray):
        self.V = V
        self.F = F
        self.hash = mesh_hash(V, F)
        self.L = build_cotan_laplacian(V, F)
        self.M_diag = build_mass_diag(V, F)
        self.grad_b, self.face_area, self.v0, self.v1 = face_geometry(V, F)
        self.face_adj = build_face_adjacency(F)
        self.mean_edge = mean_edge_length(V, F)
        self.L_factors: Dict[int, spla.SuperLU] = {}
        self.A_factors: Dict[float, spla.SuperLU] = {}

    def factor_A(self, t: float) -> spla.SuperLU:
        key = float(t)
        if key in self.A_factors:
            return self.A_factors[key]
        A = sp.diags(self.M_diag, 0, shape=self.L.shape) + t * self.L
        factor = spla.splu(A.tocsc())
        self.A_factors[key] = factor
        return factor

    def factor_L(self, pin_idx: int) -> spla.SuperLU:
        key = int(pin_idx)
        if key in self.L_factors:
            return self.L_factors[key]
        factor = factorize_pinned_laplacian(self.L, pin_idx=key)
        self.L_factors[key] = factor
        return factor


_CACHE: Dict[str, HeatCache] = {}


def _get_cache(V: np.ndarray, F: np.ndarray) -> HeatCache:
    h = mesh_hash(V, F)
    cached = _CACHE.get(h)
    if cached:
        return cached
    cache = HeatCache(V, F)
    _CACHE[h] = cache
    return cache


def _face_grad_from_scalar(cache: HeatCache, scalar: np.ndarray) -> np.ndarray:
    i0 = cache.F[:, 0]
    i1 = cache.F[:, 1]
    i2 = cache.F[:, 2]
    s0 = scalar[i0][:, None]
    s1 = scalar[i1][:, None]
    s2 = scalar[i2][:, None]
    grad = (
        cache.grad_b[:, 0, :] * s0
        + cache.grad_b[:, 1, :] * s1
        + cache.grad_b[:, 2, :] * s2
    )
    return grad


def _divergence(cache: HeatCache, X: np.ndarray) -> np.ndarray:
    n = cache.V.shape[0]
    div = np.zeros(n, dtype=np.float64)
    i0 = cache.F[:, 0]
    i1 = cache.F[:, 1]
    i2 = cache.F[:, 2]
    area = cache.face_area
    g0 = cache.grad_b[:, 0, :]
    g1 = cache.grad_b[:, 1, :]
    g2 = cache.grad_b[:, 2, :]
    c0 = -area * np.einsum("ij,ij->i", g0, X)
    c1 = -area * np.einsum("ij,ij->i", g1, X)
    c2 = -area * np.einsum("ij,ij->i", g2, X)
    np.add.at(div, i0, c0)
    np.add.at(div, i1, c1)
    np.add.at(div, i2, c2)
    return div


def _barycentric_phi(cache: HeatCache, face: int, bary: np.ndarray, phi: np.ndarray) -> float:
    i0, i1, i2 = cache.F[face]
    return float(bary[0] * phi[i0] + bary[1] * phi[i1] + bary[2] * phi[i2])


def _walk_backtrace(
    cache: HeatCache,
    phi: np.ndarray,
    phi_range: float,
    source: Dict[str, Any],
    target: Dict[str, Any],
    step_factor: float,
    max_steps: int,
    stop_eps: float,
) -> Tuple[np.ndarray, float]:
    face = int(target["face"])
    bary = np.array(target["bary"], dtype=np.float64)
    bary = bary / max(1e-12, bary.sum())
    p = barycentric_to_point(cache.V, cache.F, face, bary)
    polyline = [p.copy()]

    source_face = int(source["face"])
    source_bary = np.array(source["bary"], dtype=np.float64)
    source_bary = source_bary / max(1e-12, source_bary.sum())
    source_point = barycentric_to_point(cache.V, cache.F, source_face, source_bary)
    phi_source = _barycentric_phi(cache, source_face, source_bary, phi)

    h = step_factor * (cache.mean_edge if cache.mean_edge > 0 else 1.0)
    grad_phi_all = _face_grad_from_scalar(cache, phi)

    phi_eps = stop_eps * max(1e-6, float(phi_range))

    dist_stop = max(stop_eps, 0.35 * (cache.mean_edge if cache.mean_edge > 0 else 1.0))

    for _ in range(max_steps):
        if np.linalg.norm(p - source_point) <= dist_stop:
            break
        grad_phi = grad_phi_all[face]
        gnorm = np.linalg.norm(grad_phi)
        if not np.isfinite(gnorm) or gnorm < 1e-12:
            # Fallback: move toward the source point if gradient vanishes.
            to_source = source_point - p
            to_len = np.linalg.norm(to_source)
            if not np.isfinite(to_len) or to_len < 1e-12:
                break
            d = to_source / to_len
        else:
            d_base = grad_phi / gnorm

            # Choose the direction that moves phi toward the source level set,
            # with a tie-breaker toward the source point to avoid wrong-way paths.
            phi_here = _barycentric_phi(cache, face, bary, phi)
            test_step = min(h, 0.25 * (cache.mean_edge if cache.mean_edge > 0 else h))
            best_dir = -1.0
            if test_step > 0:
                best_score = abs(phi_here - phi_source)
                best_dist = np.linalg.norm(p - source_point)
                dist_eps = 1e-9
                score_eps = 1e-12
                for sign in (-1.0, 1.0):
                    d_test = d_base * sign
                    db_test = cache.grad_b[face].dot(d_test)
                    bary_test = bary + test_step * db_test
                    bary_test = np.where(bary_test < 0, 0.0, bary_test)
                    s_test = bary_test.sum()
                    if s_test > 1e-12:
                        bary_test = bary_test / s_test
                    else:
                        continue
                    phi_test = _barycentric_phi(cache, face, bary_test, phi)
                    score = abs(phi_test - phi_source)
                    p_test = barycentric_to_point(cache.V, cache.F, face, bary_test)
                    dist = np.linalg.norm(p_test - source_point)
                    if dist < best_dist - dist_eps or (abs(dist - best_dist) <= dist_eps and score < best_score - score_eps):
                        best_score = score
                        best_dist = dist
                        best_dir = sign

            d = d_base * best_dir

        db = cache.grad_b[face].dot(d)
        t_hit = h
        hit_edge = -1
        for i in range(3):
            if db[i] < -1e-12:
                ti = -bary[i] / db[i]
                if 1e-12 < ti < t_hit:
                    t_hit = ti
                    hit_edge = i

        bary = bary + t_hit * db
        bary = np.where(bary < 0, 0.0, bary)
        s = bary.sum()
        if s > 1e-12:
            bary = bary / s
        p = barycentric_to_point(cache.V, cache.F, face, bary)
        polyline.append(p.copy())

        if np.linalg.norm(p - source_point) <= dist_stop:
            break
        phi_p = _barycentric_phi(cache, face, bary, phi)
        if abs(phi_p - phi_source) <= phi_eps and np.linalg.norm(p - source_point) <= max(dist_stop * 2.0, cache.mean_edge * 0.75):
            break

        if hit_edge >= 0 and t_hit < h - 1e-12:
            next_face = int(cache.face_adj[face, hit_edge])
            if next_face < 0:
                break
            i0, i1, i2 = cache.F[next_face]
            v0 = cache.V[i0]
            v1 = cache.V[i1]
            v2 = cache.V[i2]
            bary = point_barycentric(v0, v1, v2, p)
            bary = bary / max(1e-12, bary.sum())
            face = next_face

    points = np.array(polyline, dtype=np.float64)
    if points.shape[0] < 2:
        return points, 0.0
    seg = points[1:] - points[:-1]
    length = float(np.sum(np.linalg.norm(seg, axis=1)))
    return points, length


def heat_geodesic(
    V_in: np.ndarray,
    F_in: np.ndarray,
    source: Dict[str, Any],
    target: Dict[str, Any],
    options: Dict[str, Any],
) -> Dict[str, Any]:
    V = np.asarray(V_in, dtype=np.float64)
    F = np.asarray(F_in, dtype=np.int32)
    cache = _get_cache(V, F)

    t_factor = float(options.get("t_factor", 1.0))
    step_factor = float(options.get("step_factor", 0.35))
    max_steps = int(options.get("max_steps", 4000))
    stop_eps = float(options.get("stop_eps", 1e-4))
    return_phi = bool(options.get("return_phi", False))

    source_face = int(source["face"])
    source_bary = np.array(source["bary"], dtype=np.float64)
    source_bary = source_bary / max(1e-12, source_bary.sum())

    n = cache.V.shape[0]
    delta = np.zeros(n, dtype=np.float64)
    i0, i1, i2 = cache.F[source_face]
    delta[i0] += source_bary[0]
    delta[i1] += source_bary[1]
    delta[i2] += source_bary[2]

    h = cache.mean_edge if cache.mean_edge > 0 else 1.0
    t = t_factor * (h * h)
    A_factor = cache.factor_A(t)
    u = A_factor.solve(delta)

    grad_u = _face_grad_from_scalar(cache, u)
    norm = np.linalg.norm(grad_u, axis=1)
    norm = np.where(norm < 1e-12, 1e-12, norm)
    X = -grad_u / norm[:, None]

    div = _divergence(cache, X)
    pin_idx = int([i0, i1, i2][int(np.argmax(source_bary))]) if source_bary.size == 3 else int(i0)
    div[pin_idx] = 0.0
    phi = cache.factor_L(pin_idx).solve(div)

    phi_range = float(np.max(phi) - np.min(phi)) if phi.size else 0.0

    polyline, length = _walk_backtrace(
        cache,
        phi,
        phi_range,
        source,
        target,
        step_factor=step_factor,
        max_steps=max_steps,
        stop_eps=stop_eps,
    )

    out = {
        "ok": True,
        "polyline": polyline.tolist(),
        "length": length,
    }
    if return_phi:
        out["phi_vertex"] = phi.astype(np.float64).tolist()
    return out
