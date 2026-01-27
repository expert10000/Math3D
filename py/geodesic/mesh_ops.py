import hashlib
from typing import Dict, Tuple

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla


def mesh_hash(V: np.ndarray, F: np.ndarray) -> str:
    h = hashlib.sha1()
    h.update(V.tobytes(order="C"))
    h.update(F.tobytes(order="C"))
    return h.hexdigest()


def mean_edge_length(V: np.ndarray, F: np.ndarray) -> float:
    edges = np.stack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]], axis=0).reshape(-1, 2)
    edges = np.sort(edges, axis=1)
    edges = np.unique(edges, axis=0)
    if edges.size == 0:
        return 0.0
    e0 = V[edges[:, 0]]
    e1 = V[edges[:, 1]]
    lengths = np.linalg.norm(e0 - e1, axis=1)
    return float(np.mean(lengths)) if lengths.size else 0.0


def build_cotan_laplacian(V: np.ndarray, F: np.ndarray) -> sp.csr_matrix:
    n = V.shape[0]
    i0 = F[:, 0]
    i1 = F[:, 1]
    i2 = F[:, 2]
    v0 = V[i0]
    v1 = V[i1]
    v2 = V[i2]

    def cotangent(a: np.ndarray, b: np.ndarray) -> np.ndarray:
        cross = np.cross(a, b)
        denom = np.linalg.norm(cross, axis=1)
        denom = np.maximum(denom, 1e-12)
        num = np.einsum("ij,ij->i", a, b)
        return num / denom

    cot0 = cotangent(v1 - v0, v2 - v0)
    cot1 = cotangent(v2 - v1, v0 - v1)
    cot2 = cotangent(v0 - v2, v1 - v2)

    data = np.concatenate([0.5 * cot0, 0.5 * cot0, 0.5 * cot1, 0.5 * cot1, 0.5 * cot2, 0.5 * cot2])
    rows = np.concatenate([i1, i2, i2, i0, i0, i1])
    cols = np.concatenate([i2, i1, i0, i2, i1, i0])

    W = sp.coo_matrix((data, (rows, cols)), shape=(n, n)).tocsr()
    diag = np.asarray(W.sum(axis=1)).reshape(-1)
    L = sp.diags(diag, 0, shape=(n, n)) - W
    return L.tocsr()


def build_mass_diag(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    i0 = F[:, 0]
    i1 = F[:, 1]
    i2 = F[:, 2]
    v0 = V[i0]
    v1 = V[i1]
    v2 = V[i2]
    n = V.shape[0]

    nvec = np.cross(v1 - v0, v2 - v0)
    area = 0.5 * np.linalg.norm(nvec, axis=1)
    mass = np.zeros(n, dtype=np.float64)
    contrib = area / 3.0
    np.add.at(mass, i0, contrib)
    np.add.at(mass, i1, contrib)
    np.add.at(mass, i2, contrib)
    return mass


def face_geometry(V: np.ndarray, F: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    i0 = F[:, 0]
    i1 = F[:, 1]
    i2 = F[:, 2]
    v0 = V[i0]
    v1 = V[i1]
    v2 = V[i2]

    n = np.cross(v1 - v0, v2 - v0)
    area2 = np.linalg.norm(n, axis=1)
    area2_safe = np.maximum(area2, 1e-12)
    denom = (area2_safe * area2_safe)[:, None]

    grad_b0 = np.cross(n, v2 - v1) / denom
    grad_b1 = np.cross(n, v0 - v2) / denom
    grad_b2 = np.cross(n, v1 - v0) / denom
    grad_b = np.stack([grad_b0, grad_b1, grad_b2], axis=1)
    area = 0.5 * area2
    return grad_b, area, v0, v1


def build_face_adjacency(F: np.ndarray) -> np.ndarray:
    m = F.shape[0]
    adj = -np.ones((m, 3), dtype=np.int32)
    edge_map: Dict[Tuple[int, int], Tuple[int, int]] = {}

    for f in range(m):
        i0, i1, i2 = int(F[f, 0]), int(F[f, 1]), int(F[f, 2])
        edges = [
            (i1, i2, 0),
            (i2, i0, 1),
            (i0, i1, 2),
        ]
        for a, b, ei in edges:
            key = (a, b) if a < b else (b, a)
            if key in edge_map:
                other_f, other_ei = edge_map.pop(key)
                adj[f, ei] = other_f
                adj[other_f, other_ei] = f
            else:
                edge_map[key] = (f, ei)
    return adj


def point_barycentric(v0: np.ndarray, v1: np.ndarray, v2: np.ndarray, p: np.ndarray) -> np.ndarray:
    v0v1 = v1 - v0
    v0v2 = v2 - v0
    v0p = p - v0
    d00 = np.dot(v0v1, v0v1)
    d01 = np.dot(v0v1, v0v2)
    d11 = np.dot(v0v2, v0v2)
    d20 = np.dot(v0p, v0v1)
    d21 = np.dot(v0p, v0v2)
    denom = d00 * d11 - d01 * d01
    if abs(denom) < 1e-12:
        return np.array([1.0, 0.0, 0.0], dtype=np.float64)
    v = (d11 * d20 - d01 * d21) / denom
    w = (d00 * d21 - d01 * d20) / denom
    u = 1.0 - v - w
    return np.array([u, v, w], dtype=np.float64)


def barycentric_to_point(V: np.ndarray, F: np.ndarray, face: int, bary: np.ndarray) -> np.ndarray:
    i0, i1, i2 = int(F[face, 0]), int(F[face, 1]), int(F[face, 2])
    return bary[0] * V[i0] + bary[1] * V[i1] + bary[2] * V[i2]


def factorize_pinned_laplacian(L: sp.csr_matrix, pin_idx: int = 0) -> spla.SuperLU:
    Lp = L.tolil(copy=True)
    Lp[pin_idx, :] = 0
    Lp[:, pin_idx] = 0
    Lp[pin_idx, pin_idx] = 1
    return spla.splu(Lp.tocsc())
