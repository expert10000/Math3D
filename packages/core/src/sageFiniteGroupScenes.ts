/** Deterministic, independently verifiable scenes derived from pinned E02 evidence. */
import { canonicalJsonStringify, isStableDocumentId, isStructuralHash, structuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { finiteGroupAction, parseSageFiniteGroupInput, parseSageFiniteGroupResult,
  type SageFiniteGroupInput, type SageFiniteGroupResult } from "./sageFiniteGroupOperations";
import type { AlgebraObjectRef } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";
import { parseProjectAlgebraEvidence, type ProjectAlgebraEvidence } from "./projectAlgebraEvidence";

export const SAGE_GROUP_SCENE_FORMAT = "math3d.sage-finite-group-scene";
export const SAGE_GROUP_SCENE_LAYOUT = "finite-group-layout-v1";
export const MAX_GROUP_SCENE_ELEMENTS = 16;
export const MAX_GROUP_SCENE_SUBGROUPS = 24;
export type SageFiniteGroupSceneKind = "cayley" | "subgroup";
export type SageFiniteGroupSceneSource = Readonly<{ evidenceId: StableDocumentId; projectId: StableDocumentId;
  target: AlgebraObjectRef; targetHash: StructuralHash; resultHash: StructuralHash;
  sageVersion: string; backend: "docker" | "private"; input: SageFiniteGroupInput; result: SageFiniteGroupResult }>;
export type SageFiniteGroupSceneNode = Readonly<{ id: string; label: string; x: number; y: number;
  members: readonly number[]; order: number; normal: boolean }>;
export type SageFiniteGroupSceneEdge = Readonly<{ from: string; to: string; generatorIndex: number | null }>;
export type SageFiniteGroupScene = Readonly<{ format: typeof SAGE_GROUP_SCENE_FORMAT; schemaVersion: 1;
  kind: SageFiniteGroupSceneKind; layout: typeof SAGE_GROUP_SCENE_LAYOUT; width: number; height: number;
  source: SageFiniteGroupSceneSource; nodes: readonly SageFiniteGroupSceneNode[];
  edges: readonly SageFiniteGroupSceneEdge[] }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const compose = (a: readonly number[], b: readonly number[]) => b.map((image) => a[image - 1]);
const key = (value: readonly number[]) => value.join(",");
const subset = (a: readonly number[], b: readonly number[]) => a.every((item) => b.includes(item));
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const palette = ["#2563eb", "#dc2626", "#059669", "#9333ea"];

export const sageGroupSceneAvailability = (result: SageFiniteGroupResult, kind: SageFiniteGroupSceneKind): string | null => {
  if (result.order > MAX_GROUP_SCENE_ELEMENTS)
    return `Cayley scene requires at most ${MAX_GROUP_SCENE_ELEMENTS} elements.`;
  if (kind === "subgroup" && result.subgroups.length > MAX_GROUP_SCENE_SUBGROUPS)
    return `Subgroup scene requires at most ${MAX_GROUP_SCENE_SUBGROUPS} subgroups; this complete result has ${result.subgroups.length}.`;
  return null;
};

const makeScene = (kind: SageFiniteGroupSceneKind, source: SageFiniteGroupSceneSource): SageFiniteGroupScene => {
  const input = parseSageFiniteGroupInput(source.input), result = parseSageFiniteGroupResult(source.result, input);
  if (!isStableDocumentId(source.evidenceId) || source.projectId !== input.projectId ||
      source.target.objectId !== input.target.objectId || source.target.revision !== input.target.revision ||
      source.targetHash !== input.targetHash || !isStructuralHash(source.resultHash) ||
      structuralHash(result) !== source.resultHash || typeof source.sageVersion !== "string" ||
      !source.sageVersion || source.sageVersion.length > 120 || source.backend !== "docker")
    throw new TypeError("Finite-group scene provenance differs from its pinned evidence.");
  const unavailable = sageGroupSceneAvailability(result, kind);
  if (unavailable) throw new TypeError(unavailable);
  const action = finiteGroupAction(input.definition);
  if (kind === "cayley") {
    const width = 600, height = 530, cx = 300, cy = 260, radius = 205;
    const indexByElement = new Map(result.elements.map((element, index) => [key(element), index]));
    const nodes = result.elements.map((_, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / result.order;
      return { id: `g${index}`, label: index === 0 ? "e" : `g${index}`,
        x: Math.round(cx + radius * Math.cos(angle)), y: Math.round(cy + radius * Math.sin(angle)),
        members: [index], order: 1, normal: true };
    });
    const edges = result.elements.flatMap((element, index) => action.generators.map((generator, generatorIndex) => ({
      from: `g${index}`, to: `g${indexByElement.get(key(compose(element, generator)))}`,
      generatorIndex })));
    return { format: SAGE_GROUP_SCENE_FORMAT, schemaVersion: 1, kind, layout: SAGE_GROUP_SCENE_LAYOUT,
      width, height, source, nodes, edges };
  }
  const subgroups = result.subgroups;
  const orders = [...new Set(subgroups.map((item) => item.members.length))].sort((a, b) => b - a);
  const width = subgroups.length <= 12 ? 600 : 960, height = 120 + (orders.length - 1) * 110;
  const nodes = subgroups.map((item, index) => {
    const level = orders.indexOf(item.members.length);
    const peers = subgroups.map((subgroup, subgroupIndex) => ({ subgroup, subgroupIndex }))
      .filter(({ subgroup }) => subgroup.members.length === item.members.length);
    const peerIndex = peers.findIndex(({ subgroupIndex }) => subgroupIndex === index);
    return { id: `H${index}`, label: `H${index}`, x: Math.round(((peerIndex + 1) * width) / (peers.length + 1)),
      y: 60 + level * 110, members: item.members, order: item.members.length, normal: item.normal };
  });
  const edges = subgroups.flatMap((lower, lowerIndex) => subgroups.flatMap((upper, upperIndex) => {
    if (lowerIndex === upperIndex || lower.members.length >= upper.members.length ||
        !subset(lower.members, upper.members) || subgroups.some((middle, middleIndex) =>
          middleIndex !== lowerIndex && middleIndex !== upperIndex &&
          lower.members.length < middle.members.length && middle.members.length < upper.members.length &&
          subset(lower.members, middle.members) && subset(middle.members, upper.members))) return [];
    return [{ from: `H${lowerIndex}`, to: `H${upperIndex}`, generatorIndex: null }];
  }));
  return { format: SAGE_GROUP_SCENE_FORMAT, schemaVersion: 1, kind, layout: SAGE_GROUP_SCENE_LAYOUT,
    width, height, source, nodes, edges };
};

export const buildSageFiniteGroupScene = (project: Math3DProject, evidence: ProjectAlgebraEvidence,
  kind: SageFiniteGroupSceneKind): SageFiniteGroupScene => {
  const checked = parseProjectAlgebraEvidence(evidence, project.identity.id, project.algebraObjects ?? []);
  if (checked.request.operation !== "sage.group.dossier") throw new TypeError("Select saved finite-group dossier evidence.");
  return makeScene(kind, { evidenceId: checked.id, projectId: checked.projectId, target: checked.request.target,
    targetHash: checked.targetHash, resultHash: checked.resultHash, sageVersion: checked.runtime.version,
    backend: checked.runtime.backend, input: parseSageFiniteGroupInput(checked.request.params),
    result: checked.result as SageFiniteGroupResult });
};

/** Standalone JSON import rebuilds every node and edge from the embedded checked source. */
export const parseSageFiniteGroupScene = (value: unknown): SageFiniteGroupScene => {
  if (!object(value) || !exact(value, ["format", "schemaVersion", "kind", "layout", "width", "height",
    "source", "nodes", "edges"]) || value.format !== SAGE_GROUP_SCENE_FORMAT || value.schemaVersion !== 1 ||
    value.layout !== SAGE_GROUP_SCENE_LAYOUT || !["cayley", "subgroup"].includes(String(value.kind)) ||
    !object(value.source)) throw new TypeError("Invalid finite-group scene envelope.");
  const source = value.source;
  if (!exact(source, ["evidenceId", "projectId", "target", "targetHash", "resultHash", "sageVersion",
    "backend", "input", "result"])) throw new TypeError("Invalid finite-group scene source.");
  const rebuilt = makeScene(value.kind as SageFiniteGroupSceneKind, source as SageFiniteGroupSceneSource);
  if (canonicalJsonStringify(value) !== canonicalJsonStringify(rebuilt))
    throw new TypeError("Finite-group scene layout or topology differs from its pinned source.");
  return rebuilt;
};

/** Self-contained SVG with visible provenance and an embedded, independently importable scene JSON. */
export const sageFiniteGroupSceneToSvg = (value: SageFiniteGroupScene): string => {
  const scene = parseSageFiniteGroupScene(value), byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const title = scene.kind === "cayley" ? "Cayley graph" : "Subgroup inclusion graph";
  const footer = `Project ${scene.source.projectId} · ${scene.source.target.objectId}@${scene.source.target.revision} · ` +
    `evidence ${scene.source.evidenceId} · Sage ${scene.source.sageVersion} / GAP ${scene.source.result.gapVersion}`;
  const markers = palette.map((color, index) => `<marker id="arrow-${index}" markerWidth="7" markerHeight="7" refX="16" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="${color}"/></marker>`).join("");
  const edges = scene.edges.map((edge) => {
    const from = byId.get(edge.from)!, to = byId.get(edge.to)!;
    const color = edge.generatorIndex === null ? "#8aa6c5" : palette[edge.generatorIndex % palette.length];
    if (scene.kind === "subgroup") return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${color}" stroke-width="1.5"/>`;
    const generatorIndex = edge.generatorIndex!;
    if (from.id === to.id) return `<path d="M${from.x - 16},${from.y - 11} C${from.x - 50},${from.y - 48} ${from.x + 50},${from.y - 48} ${from.x + 16},${from.y - 11}" fill="none" stroke="${color}" stroke-width="1.5" marker-end="url(#arrow-${generatorIndex % palette.length})"/>`;
    const bend = (generatorIndex - (scene.source.input.definition.generators.length - 1) / 2) * 11;
    const mx = (from.x + to.x) / 2 + bend * (to.y - from.y) / 200;
    const my = (from.y + to.y) / 2 - bend * (to.x - from.x) / 200;
    return `<path d="M${from.x},${from.y} Q${mx.toFixed(1)},${my.toFixed(1)} ${to.x},${to.y}" fill="none" stroke="${color}" stroke-width="1.5" marker-end="url(#arrow-${generatorIndex % palette.length})"/>`;
  }).join("");
  const nodes = scene.nodes.map((node) => `<g><circle cx="${node.x}" cy="${node.y}" r="${scene.kind === "cayley" ? 17 : 21}" fill="${node.normal ? "#eff6ff" : "#fff7ed"}" stroke="${node.normal ? "#2563eb" : "#c56b24"}" stroke-width="2"/><text x="${node.x}" y="${node.y + 4}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#17365d">${xml(node.label)}</text></g>`).join("");
  const legend = scene.kind === "cayley" ? scene.source.input.definition.generators.map((generator, index) =>
    `<text x="${20 + index * 150}" y="${scene.height - 14}" fill="${palette[index % palette.length]}" font-family="sans-serif" font-size="12">${xml(typeof generator === "string" ? generator : generator.name)}</text>`).join("") :
    `<text x="20" y="${scene.height - 14}" fill="#526477" font-family="sans-serif" font-size="12">Blue: normal subgroup · Orange: nonnormal subgroup</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height + 45}" viewBox="0 0 ${scene.width} ${scene.height + 45}" role="img" aria-label="${xml(title)}"><title>${xml(title)}</title><desc>${xml(footer)}</desc><metadata id="math3d-scene">${xml(canonicalJsonStringify(scene))}</metadata><defs>${markers}</defs><rect width="100%" height="100%" fill="#ffffff"/><text x="20" y="24" font-family="sans-serif" font-size="15" font-weight="bold" fill="#17365d">${xml(title)}</text>${edges}${nodes}${legend}<text x="20" y="${scene.height + 28}" font-family="sans-serif" font-size="9" fill="#526477">${xml(footer)}</text></svg>`;
};
