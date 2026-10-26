import { canonicalJsonStringify, sha256Checksum } from "./documentIdentity";
import { createGraph2DFieldReference } from "./graph2dFieldReference";
import { createScientificDatasetLink } from "./scientificDatasetLink";
import { parseScientificSceneManifest, scientificTileLayout,
  scientificTileSampleLocation } from "./scientificSceneManifest";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";

type Vec3 = readonly [number, number, number];
export type VectorField3DVerifiedTile = Readonly<{ fingerprint: string; datasetId: string;
  indices: Vec3; components: readonly Readonly<{ name: string; resourceSha256: string;
    tileIndex: number; tileSha256: string; start: Vec3; size: Vec3;
    values: readonly number[] }>[] }>;
export class VectorField3DNeededTile extends Error {
  readonly indices: Vec3;
  readonly indicesBatch: readonly Vec3[];
  constructor(indicesBatch: readonly Vec3[]) {
    super("Verified source tiles needed.");
    this.indices = indicesBatch[0]!; this.indicesBatch = indicesBatch;
  }
}

/** Worker-side cache. Every admitted tile is pinned to the saved manifest and checked again. */
export class VectorField3DVerifiedTileCache {
  readonly sourceHash: string;
  readonly shape: Vec3;
  readonly fingerprint: string;
  readonly maxBytes: number;
  private readonly datasetId: string;
  private readonly referenceAxes: readonly { origin: number; spacing: number }[];
  private readonly layouts: ReturnType<typeof scientificTileLayout>[];
  private readonly resources: readonly { sha256: string; tileSha256: readonly string[];
    tileShape: Vec3 }[];
  private readonly names: readonly string[];
  private readonly tiles = [new Map<number, readonly number[]>(), new Map<number, readonly number[]>(),
    new Map<number, readonly number[]>()];
  private cachedBytes = 0;
  constructor(document: VectorField3DDocument, manifestJson: string,
    fingerprint: string, maxBytes = 64 * 1024 * 1024) {
    this.fingerprint = fingerprint; this.maxBytes = maxBytes;
    const checked = normalizeVectorField3DDocument(document);
    if (!checked.ok) throw new TypeError(checked.errors.join(" "));
    const field = checked.value.source.field;
    if (field.kind !== "scientific-bundle" ||
        sha256Checksum(new TextEncoder().encode(manifestJson)) !== `sha256:${fingerprint}`)
      throw new TypeError("Verified tile cache source fingerprint changed.");
    const parsed = parseScientificSceneManifest(manifestJson);
    if (!parsed.ok || parsed.value.schema !== "scientific-scene/v3")
      throw new TypeError("Verified tile cache requires a v3 scene.");
    const dataset = parsed.value.datasets.find(item => item.id === field.references[0].datasetId);
    if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 3 ||
        dataset.components?.length !== 3)
      throw new TypeError("Verified tile cache requires a three-component vector field.");
    this.shape = dataset.shape as Vec3;
    this.datasetId = dataset.id;
    this.referenceAxes = field.references[0].axes;
    this.names = field.references.map(ref => ref.component);
    this.resources = field.references.map(saved => {
      const fresh = createGraph2DFieldReference(manifestJson, fingerprint, saved.locator,
        saved.datasetId, saved.component);
      if (canonicalJsonStringify(saved) !== canonicalJsonStringify(fresh))
        throw new TypeError("Verified tile cache reference changed.");
      const resourceId = dataset.components!.find(part => part.name === saved.component)?.resource;
      const resource = parsed.value.resources.find(item => item.id === resourceId);
      if (!resource?.tileShape || !resource.tileSha256 || resource.sha256 !== saved.resourceSha256)
        throw new TypeError("Verified tile cache component changed.");
      return { sha256: resource.sha256, tileSha256: resource.tileSha256,
        tileShape: resource.tileShape as Vec3 };
    });
    this.layouts = this.resources.map(resource => scientificTileLayout(this.shape, resource.tileShape));
    this.sourceHash = createScientificDatasetLink(field.references).sourceHash;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 256 * 1024 * 1024)
      throw new RangeError("Invalid verified tile cache budget.");
  }
  add(transfer: VectorField3DVerifiedTile): void {
    if (transfer.fingerprint !== this.fingerprint ||
        transfer.datasetId !== this.datasetId || transfer.components.length !== 3 ||
        transfer.indices.some((index, axis) => !Number.isSafeInteger(index) ||
          index < 0 || index >= this.shape[axis]!))
      throw new TypeError("Verified tile transfer source changed.");
    for (let component = 0; component < 3; component++) {
      const part = transfer.components[component]!, resource = this.resources[component]!;
      const location = scientificTileSampleLocation(this.shape, resource.tileShape,
        transfer.indices, this.layouts[component]!);
      const tile = this.layouts[component]![location.tileIndex]!;
      if (part.name !== this.names[component] || part.resourceSha256 !== resource.sha256 ||
          part.tileIndex !== tile.index || part.tileSha256 !== resource.tileSha256[tile.index] ||
          canonicalJsonStringify(part.start) !== canonicalJsonStringify(tile.start) ||
          canonicalJsonStringify(part.size) !== canonicalJsonStringify(tile.size) ||
          part.values.length !== tile.bytes / 8 || !part.values.every(Number.isFinite))
        throw new TypeError("Verified tile transfer coverage changed.");
      const bytes = new Uint8Array(tile.bytes), view = new DataView(bytes.buffer);
      part.values.forEach((value, index) => view.setFloat64(index * 8, value, true));
      if (sha256Checksum(bytes) !== `sha256:${part.tileSha256}`)
        throw new TypeError("Verified tile transfer checksum changed.");
      if (!this.tiles[component]!.has(tile.index)) {
        if (this.cachedBytes + tile.bytes > this.maxBytes)
          throw new RangeError("Verified tile cache memory budget reached.");
        this.tiles[component]!.set(tile.index, part.values);
        this.cachedBytes += tile.bytes;
      }
    }
  }
  get residentBytes(): number { return this.cachedBytes; }
  /** Prefetch only when the regular seed lattice spans most of a small, equally tiled field. */
  equilibriumPrefetchPlan(document: VectorField3DDocument,
    seedResolution: 3 | 5 = 5, maxEvaluations = 40000): readonly Vec3[] | null {
    if (!this.matches(document) || ![3, 5].includes(seedResolution) ||
        this.resources.some(resource => resource.tileShape.some((size, axis) =>
          size !== this.resources[0]!.tileShape[axis])) ||
        this.layouts[0]!.length > 4096 ||
        this.layouts.reduce((sum, layout) => sum + layout.reduce((bytes, tile) =>
          bytes + tile.bytes, 0), 0) > this.maxBytes)
      return null;
    const checked = normalizeVectorField3DDocument(document);
    if (!checked.ok || maxEvaluations < seedResolution ** 3 * 12) return null;
    const axes = checked.value.source.axes;
    const seeds = [...checked.value.source.seeds.map(seed => seed.position),
      ...Array.from({ length: seedResolution ** 3 }, (_, index) => {
        const coordinates = [Math.floor(index / seedResolution ** 2),
          Math.floor(index / seedResolution) % seedResolution, index % seedResolution]
          .map((step, axis) => axes[axis]!.min +
            (axes[axis]!.max - axes[axis]!.min) * step / (seedResolution - 1));
        return [coordinates[0]!, coordinates[1]!, coordinates[2]!] as Vec3;
      })];
    const touched = new Set(seeds.map(position => {
      const indices = position.map((coordinate, axis) => Math.min(this.shape[axis]! - 1,
        Math.max(0, Math.round((coordinate - this.referenceAxes[axis]!.origin) /
          this.referenceAxes[axis]!.spacing)))) as [number, number, number];
      return scientificTileSampleLocation(this.shape, this.resources[0]!.tileShape,
        indices, this.layouts[0]!).tileIndex;
    }));
    if (touched.size / this.layouts[0]!.length < 0.7) return null;
    return this.layouts[0]!.map(tile => tile.start);
  }
  matches(document: VectorField3DDocument): boolean {
    return document.source.field.kind === "scientific-bundle" &&
      document.source.field.references[0].sceneFingerprint === this.fingerprint &&
      createScientificDatasetLink(document.source.field.references).sourceHash === this.sourceHash;
  }
  get provenance() {
    return this.names.map((name, component) => {
      const indices = [...this.tiles[component]!.keys()].sort((a, b) => a - b);
      const hashes = indices.map(index => this.resources[component]!.tileSha256[index]!);
      return { name, resourceSha256: this.resources[component]!.sha256,
        verifiedTiles: indices.length, totalTiles: this.layouts[component]!.length,
        tileIndices: indices, tileSha256: hashes,
        tileSetSha256: sha256Checksum(new TextEncoder().encode(
          indices.map((index, at) => `${index}:${hashes[at]}`).join("|"))).slice(7) };
    });
  }
  sample(position: Vec3): Vec3 | null {
    const lower: number[] = [], fraction: number[] = [];
    for (let axis = 0; axis < 3; axis++) {
      const reference = this.referenceAxes[axis]!;
      const continuous = (position[axis] - reference.origin) / reference.spacing;
      if (!Number.isFinite(continuous) || continuous < -1e-9 ||
          continuous > this.shape[axis]! - 1 + 1e-9) return null;
      const low = Math.min(this.shape[axis]! - 2, Math.max(0, Math.floor(continuous)));
      lower.push(low); fraction.push(Math.max(0, Math.min(1, continuous - low)));
    }
    const missing = new Map<string, Vec3>();
    for (let corner = 0; corner < 8; corner++) {
      const point = lower.map((low, axis) => low + ((corner >> axis) & 1)) as [number, number, number];
      const tileIndices = this.resources.map((resource, component) =>
        scientificTileSampleLocation(this.shape, resource.tileShape, point,
          this.layouts[component]!).tileIndex);
      if (tileIndices.some((tileIndex, component) => !this.tiles[component]!.has(tileIndex)))
        missing.set(tileIndices.join(","), point);
    }
    if (missing.size) throw new VectorField3DNeededTile([...missing.values()]);
    const result = [0, 0, 0];
    for (let corner = 0; corner < 8; corner++) {
      const point = lower.map((low, axis) => low + ((corner >> axis) & 1)) as [number, number, number];
      const weight = fraction.reduce((product, value, axis) => product *
        ((corner >> axis) & 1 ? value : 1 - value), 1);
      for (let component = 0; component < 3; component++) {
        const resource = this.resources[component]!;
        const location = scientificTileSampleLocation(this.shape, resource.tileShape,
          point, this.layouts[component]!);
        const values = this.tiles[component]!.get(location.tileIndex);
        result[component] += weight * values![location.offsetBytes / 8]!;
      }
    }
    return result.every(Number.isFinite) ? result as [number, number, number] : null;
  }
}
