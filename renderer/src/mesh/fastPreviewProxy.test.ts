import { describe, expect, it } from "vitest";
import { buildFastPreviewProxy } from "./fastPreviewProxy";

const makeGrid = (size: number) => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= size; y += 1) {
    for (let x = 0; x <= size; x += 1) positions.push(x, y, 0);
  }
  const vertex = (x: number, y: number) => y * (size + 1) + x;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const a = vertex(x, y);
      const b = vertex(x + 1, y);
      const c = vertex(x + 1, y + 1);
      const d = vertex(x, y + 1);
      indices.push(a, b, c, a, c, d);
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
};

const countComponents = (vertexCount: number, indices: Uint32Array) => {
  const adjacency = Array.from({ length: vertexCount }, () => new Set<number>());
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    adjacency[a].add(b); adjacency[a].add(c);
    adjacency[b].add(a); adjacency[b].add(c);
    adjacency[c].add(a); adjacency[c].add(b);
  }
  const visited = new Uint8Array(vertexCount);
  let components = 0;
  for (let start = 0; start < vertexCount; start += 1) {
    if (visited[start] || adjacency[start].size === 0) continue;
    components += 1;
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const current = stack.pop() ?? -1;
      for (const neighbor of adjacency[current]) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
  }
  return components;
};

describe("fast mesh preview proxies", () => {
  it("preserves the existing independent-triangle Fast sample", () => {
    const proxy = buildFastPreviewProxy(makeGrid(32), 80, "triangle-sample");
    expect(proxy.indices).toBeNull();
    expect(proxy.positions.length / 9).toBe(80);
  });

  it("builds a shared-index connected proxy instead of triangle soup", () => {
    const proxy = buildFastPreviewProxy(makeGrid(64), 180, "connected-cluster");
    expect(proxy.indices).not.toBeNull();
    const indices = proxy.indices!;
    const triangleCount = indices.length / 3;
    const vertexCount = proxy.positions.length / 3;
    expect(triangleCount).toBeGreaterThan(0);
    expect(vertexCount).toBeLessThan(triangleCount * 3);
    expect(countComponents(vertexCount, indices)).toBeLessThan(triangleCount);
  });
});
