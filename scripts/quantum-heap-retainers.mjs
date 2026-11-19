import { createHash } from "node:crypto";

const safeName = value => /^[A-Za-z_$][A-Za-z0-9_$ .<>-]{0,79}$/.test(value)
  ? value : "[redacted]";

export function summarizeQuantumHeapRetainers(snapshot, baselineNodeIds = null) {
  const { nodes, edges, strings } = snapshot;
  const nodeFields = snapshot.snapshot.meta.node_fields;
  const edgeFields = snapshot.snapshot.meta.edge_fields;
  const nodeStride = nodeFields.length;
  const edgeStride = edgeFields.length;
  const nodeTypeAt = nodeFields.indexOf("type");
  const nodeNameAt = nodeFields.indexOf("name");
  const nodeSizeAt = nodeFields.indexOf("self_size");
  const nodeIdAt = nodeFields.indexOf("id");
  const nodeEdgesAt = nodeFields.indexOf("edge_count");
  const edgeTypeAt = edgeFields.indexOf("type");
  const edgeNameAt = edgeFields.indexOf("name_or_index");
  const edgeTargetAt = edgeFields.indexOf("to_node");
  if ([nodeTypeAt, nodeNameAt, nodeSizeAt, nodeIdAt, nodeEdgesAt,
    edgeTypeAt, edgeNameAt, edgeTargetAt].some(index => index < 0))
    throw new Error("Unknown V8 heap snapshot node or edge fields");
  const nodeTypes = snapshot.snapshot.meta.node_types[nodeTypeAt];
  const edgeTypes = snapshot.snapshot.meta.edge_types[edgeTypeAt];
  const nodeCount = nodes.length / nodeStride;
  const edgeCount = edges.length / edgeStride;
  const incoming = new Int32Array(nodeCount).fill(-1);
  const outgoingStart = new Int32Array(nodeCount);
  const next = new Int32Array(edgeCount).fill(-1);
  const source = new Int32Array(edgeCount);
  let edgeNumber = 0;
  for (let node = 0; node < nodeCount; node++) {
    outgoingStart[node] = edgeNumber;
    const count = nodes[node * nodeStride + nodeEdgesAt];
    for (let i = 0; i < count; i++, edgeNumber++) {
      const targetOffset = edges[edgeNumber * edgeStride + edgeTargetAt];
      const target = targetOffset / nodeStride;
      if (!Number.isInteger(target) || target < 0 || target >= nodeCount)
        throw new Error("Invalid V8 heap snapshot edge target");
      source[edgeNumber] = node;
      if (edgeTypes[edges[edgeNumber * edgeStride + edgeTypeAt]] === "weak") continue;
      next[edgeNumber] = incoming[target];
      incoming[target] = edgeNumber;
    }
  }
  if (edgeNumber !== edgeCount) throw new Error("V8 heap snapshot edge count mismatch");
  const contextTargets = [];
  const stringTargets = [];
  const newObjectTargets = [];
  for (let node = 0; node < nodeCount; node++) {
    const at = node * nodeStride;
    const type = nodeTypes[nodes[at + nodeTypeAt]];
    const name = strings[nodes[at + nodeNameAt]];
    const bytes = nodes[at + nodeSizeAt];
    if (type === "native" && name === "WebGL2RenderingContext")
      contextTargets.push({ node, bytes, id: nodes[at + nodeIdAt] });
    if (type === "string" && bytes >= 100_000)
      stringTargets.push({ node, bytes, id: nodes[at + nodeIdAt] });
    if (baselineNodeIds && ["array", "object"].includes(type) && bytes >= 4096 &&
        !baselineNodeIds.has(nodes[at + nodeIdAt]))
      newObjectTargets.push({ node, bytes, id: nodes[at + nodeIdAt], kind: `new ${type}` });
  }
  contextTargets.sort((a, b) => b.id - a.id);
  stringTargets.sort((a, b) => b.bytes - a.bytes);
  newObjectTargets.sort((a, b) => b.bytes - a.bytes);
  const stringGroups = new Map();
  for (const target of stringTargets) {
    const value = strings[nodes[target.node * nodeStride + nodeNameAt]];
    // V8 heap snapshots truncate long string values to a preview. This hash
    // groups matching previews; it is not a hash of the complete live string.
    const prefixSha256 = createHash("sha256").update(value).digest("hex");
    const kind = value.startsWith("{") ? "json-object" : value.startsWith("[") ? "json-array" :
      value.startsWith("data:") ? "data-url" : "other";
    const fieldKeys = kind.startsWith("json") ? [...value.matchAll(/"([^"\\]{1,80})"\s*:/g)]
      .slice(0, 12).map(match => safeName(match[1])) : [];
    const group = stringGroups.get(prefixSha256) ?? { prefixSha256, kind,
      previewChars: value.length, fieldKeys, count: 0, selfBytes: 0 };
    group.count++;
    group.selfBytes += target.bytes;
    stringGroups.set(prefixSha256, group);
  }
  const targets = [...contextTargets.slice(0, 3).map(row => ({ ...row, kind: "WebGL2RenderingContext" })),
    ...stringTargets.slice(0, 3).map(row => ({ ...row, kind: "large string" })),
    ...newObjectTargets.slice(0, 5)];
  const label = node => {
    const at = node * nodeStride;
    const type = nodeTypes[nodes[at + nodeTypeAt]];
    const name = type === "string" ? "[string]" : safeName(strings[nodes[at + nodeNameAt]]);
    if (type !== "object") return `${type}:${name}`;
    let materialType = null;
    let marker = null;
    const start = outgoingStart[node];
    const count = nodes[at + nodeEdgesAt];
    for (let i = start; i < start + count; i++) {
      const edgeAt = i * edgeStride;
      if (edgeTypes[edges[edgeAt + edgeTypeAt]] !== "property") continue;
      const property = strings[edges[edgeAt + edgeNameAt]];
      if (["isTexture", "isRenderTarget", "isWebGLRenderTarget", "isMaterial",
        "isBufferGeometry"].includes(property)) marker = property;
      if (property !== "type") continue;
      const target = edges[edgeAt + edgeTargetAt];
      if (nodeTypes[nodes[target + nodeTypeAt]] === "string")
        materialType = safeName(strings[nodes[target + nodeNameAt]]);
    }
    return `${type}:${name}${materialType || marker ? `{${materialType ?? marker}}` : ""}`;
  };
  return { nodeCount, edgeCount, totalWebGLContexts: contextTargets.length,
    newLargeObjectCount: newObjectTargets.length,
    newLargeObjectSelfBytes: newObjectTargets.reduce((sum, item) => sum + item.bytes, 0),
    largeStringCount: stringTargets.length,
    largeStrings: { totalSelfBytes: stringTargets.reduce((sum, item) => sum + item.bytes, 0),
      groups: [...stringGroups.values()].sort((a, b) => b.selfBytes - a.selfBytes).slice(0, 20) },
    paths: targets.map(target => {
      const towardTarget = new Int32Array(nodeCount).fill(-1);
      const viaEdge = new Int32Array(nodeCount).fill(-1);
      const queue = new Int32Array(nodeCount);
      queue[0] = target.node;
      towardTarget[target.node] = target.node;
      let head = 0; let tail = 1;
      while (head < tail && towardTarget[0] < 0 && tail < 500_000) {
        const child = queue[head++];
        for (let edge = incoming[child]; edge >= 0; edge = next[edge]) {
          const parent = source[edge];
          if (towardTarget[parent] >= 0) continue;
          towardTarget[parent] = child;
          viaEdge[parent] = edge;
          queue[tail++] = parent;
          if (parent === 0 || tail >= 500_000) break;
        }
      }
      const path = [];
      let reachedTarget = false;
      if (towardTarget[0] >= 0) {
        let node = 0;
        // React closure chains can exceed 24 edges; keep the path bounded but
        // reach far enough to identify what retains large serialized strings.
        for (let depth = 0; depth < 96; depth++) {
          const edge = viaEdge[node];
          const edgeType = edge < 0 ? null : edgeTypes[edges[edge * edgeStride + edgeTypeAt]];
          const rawEdgeName = edge < 0 ? null : edges[edge * edgeStride + edgeNameAt];
          const edgeName = edge < 0 ? null : ["element", "hidden"].includes(edgeType)
            ? String(rawEdgeName) : safeName(strings[rawEdgeName]);
          path.push({ node: label(node), edgeType, edgeName });
          if (node === target.node) { reachedTarget = true; break; }
          node = towardTarget[node];
        }
      }
      return { kind: target.kind, selfBytes: target.bytes,
        status: towardTarget[0] < 0 ? "root path not found within limit" :
          reachedTarget ? "root path found" : "root path truncated",
        searchedNodes: tail, path };
    }) };
}
