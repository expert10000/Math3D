import {
  createSceneObjectEnvelope,
  deserializeSceneObjectEnvelope,
  serializeSceneObjectEnvelope,
  structuralHash,
  type SceneDocument,
  type SceneObjectEnvelope,
  type SceneObjectTransform,
} from "@math3d/core";
import type { MobileMeshPayload, MobileRenderQuality } from "../viewer/mobileSurfacePreview";
import { buildSurfacePreviewGeometry } from "../viewer/mobileSurfacePreview";
import { readMobileImportedSceneObject } from "./mobileSceneObjectImport";

export const MOBILE_DERIVED_MESH_SEMANTICS_WARNING =
  "Mesh-only export does not include the formula, editable definition, domain, analysis metadata, or Math3D provenance.";

export const MOBILE_OBJECT_EXPORT_FORMATS = ["obj", "ply", "stl"] as const;
export type MobileObjectMeshExportFormat = (typeof MOBILE_OBJECT_EXPORT_FORMATS)[number];

export type MobileObjectExportArtifact = Readonly<{
  fileName: string;
  content: string;
  mimeType: string;
  uti: string;
  semantic: boolean;
  formatLabel: string;
  objectId: string;
}>;

export type MobileObjectExportContext = Readonly<{
  scene: SceneDocument;
  objectId: string;
  visible: boolean;
  opacity?: number;
  mesh?: MobileMeshPayload;
  quality?: MobileRenderQuality;
  now?: number;
}>;

const identityTransform: SceneObjectTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const safeFileStem = (value: string): string => {
  const normalized = value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "math3d-object";
};

const timestampForFile = (now: number): string => new Date(now)
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z")
  .replace("T", "-");

const artifactName = (
  objectId: string,
  format: string,
  hash: string,
  now: number,
  extension: string
): string => `${safeFileStem(objectId)}-${format}-${timestampForFile(now)}-${hash.replace(/^sha256:/, "").slice(0, 12)}.${extension}`;

const surfaceFor = (context: MobileObjectExportContext) => {
  const surface = context.scene.surfaces?.find((candidate) => candidate.id === context.objectId);
  if (!surface) throw new Error("The selected object no longer exists.");
  return surface;
};

const embeddedGeometry = (mesh: MobileMeshPayload | undefined) => mesh ? ({
  kind: "embedded-mesh" as const,
  positions: Array.from(mesh.positions),
  indices: Array.from(mesh.indices),
  ...(mesh.normals && mesh.normals.length === mesh.positions.length
    ? { normals: Array.from(mesh.normals) }
    : {}),
}) : null;

export const createMobileSemanticObjectEnvelope = (
  context: MobileObjectExportContext
): SceneObjectEnvelope => {
  const surface = surfaceFor(context);
  const imported = readMobileImportedSceneObject(context.scene, context.objectId);
  const geometry = surface.kind === "mesh"
    ? imported?.envelope.geometry ?? embeddedGeometry(context.mesh)
    : null;
  if (surface.kind === "mesh" && geometry === null) {
    throw new Error("This mesh has no self-contained geometry to export.");
  }
  return createSceneObjectEnvelope({
    producer: { name: "Math3D Mobile", version: "1.5.1", platform: "mobile" },
    object: {
      id: surface.id,
      kind: surface.kind,
      definition: surface,
      transform: imported?.envelope.object.transform ?? identityTransform,
      visible: context.visible,
      style: {
        ...(imported?.envelope.object.style.color ? { color: imported.envelope.object.style.color } : {}),
        ...(context.opacity === undefined ? {} : { opacity: context.opacity }),
        ...(imported?.envelope.object.style.wireframe === undefined
          ? {}
          : { wireframe: imported.envelope.object.style.wireframe }),
      },
    },
    geometry,
    provenance: {
      sourceFormat: "math3d.scene-project",
      sourceProjectId: context.scene.id,
      sourceObjectId: surface.id,
      importedAt: null,
    },
    analysisMetadata: imported?.envelope.analysisMetadata ?? {},
  });
};

export const prepareMobileSemanticObjectExport = (
  context: MobileObjectExportContext
): MobileObjectExportArtifact => {
  const envelope = createMobileSemanticObjectEnvelope(context);
  const content = serializeSceneObjectEnvelope(envelope);
  const readBack = deserializeSceneObjectEnvelope(content);
  if (!readBack.ok || readBack.value.contentHash !== envelope.contentHash) {
    throw new Error("The semantic object export failed validation.");
  }
  const now = context.now ?? Date.now();
  return {
    fileName: artifactName(context.objectId, "semantic", envelope.contentHash, now, "math3d-object.json"),
    content,
    mimeType: "application/json",
    uti: "public.json",
    semantic: true,
    formatLabel: "Math3D object",
    objectId: context.objectId,
  };
};

const checkedMesh = (mesh: MobileMeshPayload, objectId: string): MobileMeshPayload => {
  if (mesh.positions.length < 9 || mesh.positions.length % 3 !== 0 || mesh.indices.length < 3 || mesh.indices.length % 3 !== 0) {
    throw new Error(`${objectId} has no exportable triangle mesh.`);
  }
  if (Array.from(mesh.positions).some((value) => !Number.isFinite(value))) {
    throw new Error(`${objectId} contains a non-finite mesh coordinate.`);
  }
  const vertexCount = mesh.positions.length / 3;
  if (Array.from(mesh.indices).some((value) => !Number.isSafeInteger(value) || value < 0 || value >= vertexCount)) {
    throw new Error(`${objectId} contains an invalid mesh index.`);
  }
  return mesh;
};

const meshFromGeometry = (geometry: any, objectId: string): MobileMeshPayload => {
  const position = geometry?.getAttribute?.("position");
  const normal = geometry?.getAttribute?.("normal");
  const index = geometry?.getIndex?.();
  if (!position?.array || !index?.array) throw new Error(`${objectId} has no exportable triangle mesh.`);
  const positions = new Float32Array(position.array as ArrayLike<number>);
  const rawIndices = Array.from(index.array as ArrayLike<number>);
  const indices = positions.length / 3 <= 65_535 ? new Uint16Array(rawIndices) : new Uint32Array(rawIndices);
  const normals = normal?.array ? new Float32Array(normal.array as ArrayLike<number>) : undefined;
  return checkedMesh({ positions, indices, ...(normals ? { normals } : {}), vertexCount: positions.length / 3, triCount: indices.length / 3 }, objectId);
};

export const deriveMobileObjectMesh = (context: MobileObjectExportContext): MobileMeshPayload => {
  if (context.mesh) return checkedMesh(context.mesh, context.objectId);
  const surface = surfaceFor(context);
  const preview = buildSurfacePreviewGeometry(surface, context.quality ?? "balanced");
  if (preview.state !== "ready" || !preview.geometry) {
    throw new Error("Compute this object before exporting a derived mesh.");
  }
  try {
    return meshFromGeometry(preview.geometry, context.objectId);
  } finally {
    preview.geometry.dispose?.();
  }
};

const vertex = (positions: Float32Array, index: number): [number, number, number] => [
  positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2],
];

const normalForTriangle = (a: [number, number, number], b: [number, number, number], c: [number, number, number]): [number, number, number] => {
  const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
  const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
  const x = uy * vz - uz * vy; const y = uz * vx - ux * vz; const z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z);
  return length > 0 ? [x / length, y / length, z / length] : [0, 0, 0];
};

const serializeObj = (mesh: MobileMeshPayload, objectId: string): string => {
  const lines = [`# Math3D derived mesh export: ${objectId}`, `o ${safeFileStem(objectId)}`];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    lines.push(`v ${mesh.positions[index]} ${mesh.positions[index + 1]} ${mesh.positions[index + 2]}`);
  }
  const hasNormals = mesh.normals?.length === mesh.positions.length;
  if (hasNormals) {
    for (let index = 0; index < mesh.normals!.length; index += 3) {
      lines.push(`vn ${mesh.normals![index]} ${mesh.normals![index + 1]} ${mesh.normals![index + 2]}`);
    }
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const values = [mesh.indices[index] + 1, mesh.indices[index + 1] + 1, mesh.indices[index + 2] + 1];
    lines.push(`f ${values.map((value) => hasNormals ? `${value}//${value}` : String(value)).join(" ")}`);
  }
  return `${lines.join("\n")}\n`;
};

const serializePly = (mesh: MobileMeshPayload, objectId: string): string => {
  const hasNormals = mesh.normals?.length === mesh.positions.length;
  const lines = [
    "ply", "format ascii 1.0", `comment Math3D derived mesh export: ${objectId}`,
    `element vertex ${mesh.vertexCount}`, "property float x", "property float y", "property float z",
    ...(hasNormals ? ["property float nx", "property float ny", "property float nz"] : []),
    `element face ${mesh.triCount}`, "property list uchar uint vertex_indices", "end_header",
  ];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const values = [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]];
    if (hasNormals) values.push(mesh.normals![index], mesh.normals![index + 1], mesh.normals![index + 2]);
    lines.push(values.join(" "));
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    lines.push(`3 ${mesh.indices[index]} ${mesh.indices[index + 1]} ${mesh.indices[index + 2]}`);
  }
  return `${lines.join("\n")}\n`;
};

const serializeStl = (mesh: MobileMeshPayload, objectId: string): string => {
  const lines = [`solid ${safeFileStem(objectId)}`];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = vertex(mesh.positions, mesh.indices[index]);
    const b = vertex(mesh.positions, mesh.indices[index + 1]);
    const c = vertex(mesh.positions, mesh.indices[index + 2]);
    const normal = normalForTriangle(a, b, c);
    lines.push(`  facet normal ${normal.join(" ")}`, "    outer loop", `      vertex ${a.join(" ")}`, `      vertex ${b.join(" ")}`, `      vertex ${c.join(" ")}`, "    endloop", "  endfacet");
  }
  lines.push(`endsolid ${safeFileStem(objectId)}`);
  return `${lines.join("\n")}\n`;
};

export const prepareMobileDerivedMeshExport = (
  context: MobileObjectExportContext,
  format: MobileObjectMeshExportFormat
): MobileObjectExportArtifact => {
  const mesh = deriveMobileObjectMesh(context);
  const content = format === "obj" ? serializeObj(mesh, context.objectId)
    : format === "ply" ? serializePly(mesh, context.objectId)
      : serializeStl(mesh, context.objectId);
  const hash = structuralHash({ format, content });
  const now = context.now ?? Date.now();
  return {
    fileName: artifactName(context.objectId, format, hash, now, format),
    content,
    mimeType: format === "stl" ? "model/stl" : format === "ply" ? "application/x-ply" : "model/obj",
    uti: "public.data",
    semantic: false,
    formatLabel: format.toUpperCase(),
    objectId: context.objectId,
  };
};

export const validateMobileSemanticObjectArtifact = (artifact: MobileObjectExportArtifact): SceneObjectEnvelope => {
  if (!artifact.semantic) throw new Error("Expected a semantic Math3D object artifact.");
  const readBack = deserializeSceneObjectEnvelope(artifact.content);
  if (!readBack.ok) throw new Error(`Exported object validation failed: ${readBack.errors.join("; ")}`);
  return readBack.value;
};
