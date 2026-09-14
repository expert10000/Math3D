import { describe, expect, it } from "vitest";
import {
  createStableDocumentId,
  sha256Checksum,
  structuralHash,
  type AnalysisArtifactHandle,
  type ScientificSourceGeneration,
  type StableDocumentId,
} from "@math3d/core";
import {
  createInMemoryArtifactRegistry,
  type ArtifactRegistryEvent,
} from "@math3d/kernel";

const documentA = createStableDocumentId("artifact", { document: "a" });
const documentB = createStableDocumentId("artifact", { document: "b" });

const source = (
  documentId: StableDocumentId = documentA,
  revision = 1,
  generation = revision
): ScientificSourceGeneration => ({
  documentId,
  revision,
  structuralHash: structuralHash({ documentId, revision }),
  generation,
});

const gridHandle: AnalysisArtifactHandle = {
  artifactId: "artifact:grid:a",
  kind: "sampled-grid",
  role: "scalar-field",
};

const meshHandle: AnalysisArtifactHandle = {
  artifactId: "artifact:mesh:a",
  kind: "mesh",
  role: "canonical-complex",
};

const makeFixture = (maximum = 1_024) => {
  const current = new Map<StableDocumentId, ScientificSourceGeneration>([
    [documentA, source(documentA)],
    [documentB, source(documentB)],
  ]);
  const registry = createInMemoryArtifactRegistry({
    maxArtifactBytes: maximum,
    resolveSource: (documentId) => current.get(documentId) ?? null,
  });
  return { current, registry };
};

const declare = (
  registry: ReturnType<typeof createInMemoryArtifactRegistry>,
  handle = gridHandle,
  artifactSource = source(),
  ownerId = "cache:topology"
) => registry.declare({ handle, source: artifactSource, ownerId, encoding: "application/octet-stream" });

describe("revisioned artifact registry", () => {
  it("declares compact immutable dirty/unavailable metadata without payload", () => {
    const { registry } = makeFixture();
    const metadata = declare(registry);

    expect(metadata).toMatchObject({
      schemaVersion: 1,
      handle: gridHandle,
      source: source(),
      ownerId: "cache:topology",
      availability: "unavailable",
      status: "dirty",
      byteLength: null,
      checksum: null,
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.handle)).toBe(true);
    expect(JSON.stringify(registry.listMetadata())).not.toContain("bytes");
  });

  it("computes size and SHA-256 from detached publication bytes", () => {
    const { registry } = makeFixture();
    declare(registry);
    const input = new Uint8Array([1, 2, 3]);
    const metadata = registry.publish({
      artifactId: gridHandle.artifactId,
      source: source(),
      ownerId: "cache:topology",
      bytes: input,
    });
    input[0] = 99;

    expect(metadata).toMatchObject({ availability: "available", status: "clean", byteLength: 3 });
    expect(metadata.checksum).toBe(sha256Checksum(new Uint8Array([1, 2, 3])));
    const first = registry.resolve(gridHandle, source());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect([...first.bytes]).toEqual([1, 2, 3]);
    first.bytes[1] = 88;
    const second = registry.resolve(gridHandle, source());
    expect(second.ok && [...second.bytes]).toEqual([1, 2, 3]);
  });

  it("uses the portable raw-byte SHA-256 definition", () => {
    expect(sha256Checksum(new TextEncoder().encode("abc"))).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(() => sha256Checksum([] as never)).toThrow(/Uint8Array/);
  });

  it("moves explicitly through computing and failed unavailable states", () => {
    const { registry } = makeFixture();
    declare(registry);
    expect(registry.beginComputation(gridHandle.artifactId, "cache:topology", source()).status).toBe("computing");
    const failed = registry.fail({
      artifactId: gridHandle.artifactId,
      source: source(),
      ownerId: "cache:topology",
      failure: { code: "DECODE_FAILED", message: "Worker output could not be decoded." },
    });
    expect(failed).toMatchObject({
      availability: "unavailable",
      status: "failed",
      byteLength: null,
      checksum: null,
      failure: { code: "DECODE_FAILED" },
    });
    const resolution = registry.resolve(gridHandle, source());
    expect(resolution).toMatchObject({ ok: false, availability: "unavailable", reason: "failed" });
  });

  it("enforces the byte ceiling without publishing partial state", () => {
    const { registry } = makeFixture(3);
    declare(registry);
    registry.beginComputation(gridHandle.artifactId, "cache:topology", source());
    expect(() => registry.publish({
      artifactId: gridHandle.artifactId,
      source: source(),
      ownerId: "cache:topology",
      bytes: new Uint8Array([1, 2, 3, 4]),
    })).toThrow(/maxArtifactBytes/);
    expect(registry.listMetadata()[0]).toMatchObject({ status: "computing", availability: "unavailable" });
  });

  it("guards every publication and resolution against current source generation", () => {
    const { current, registry } = makeFixture();
    declare(registry);
    current.set(documentA, source(documentA, 2));

    expect(() => registry.publish({
      artifactId: gridHandle.artifactId,
      source: source(),
      ownerId: "cache:topology",
      bytes: new Uint8Array([1]),
    })).toThrow(/not the current/);
    expect(registry.resolve(gridHandle, source())).toMatchObject({
      ok: false,
      availability: "unavailable",
      reason: "stale-source",
    });
  });

  it("fully invalidates exactly non-current artifacts for one document in ID order", () => {
    const { current, registry } = makeFixture();
    declare(registry, meshHandle);
    declare(registry, gridHandle);
    const otherHandle: AnalysisArtifactHandle = { ...gridHandle, artifactId: "artifact:grid:b" };
    declare(registry, otherHandle, source(documentB), "cache:volume");
    for (const [handle, artifactSource, ownerId] of [
      [meshHandle, source(), "cache:topology"],
      [gridHandle, source(), "cache:topology"],
      [otherHandle, source(documentB), "cache:volume"],
    ] as const) {
      registry.publish({ artifactId: handle.artifactId, source: artifactSource, ownerId, bytes: new Uint8Array([7]) });
    }

    const next = source(documentA, 2);
    current.set(documentA, next);
    const currentHandle: AnalysisArtifactHandle = { ...gridHandle, artifactId: "artifact:grid:a:2" };
    declare(registry, currentHandle, next);
    registry.publish({
      artifactId: currentHandle.artifactId,
      source: next,
      ownerId: "cache:topology",
      bytes: new Uint8Array([8]),
    });

    expect(registry.invalidateDocumentSource(next)).toEqual(["artifact:grid:a", "artifact:mesh:a"]);
    expect(registry.invalidateDocumentSource(next)).toEqual([]);
    const metadata = registry.listMetadata();
    expect(metadata.find((entry) => entry.handle.artifactId === gridHandle.artifactId)).toMatchObject({
      status: "dirty", availability: "unavailable", byteLength: null, checksum: null,
    });
    expect(metadata.find((entry) => entry.handle.artifactId === currentHandle.artifactId)).toMatchObject({
      status: "clean", availability: "available",
    });
    expect(metadata.find((entry) => entry.handle.artifactId === otherHandle.artifactId)).toMatchObject({
      status: "clean", availability: "available",
    });
  });

  it("returns an explicit immutable unavailable reference for a missing handle", () => {
    const { registry } = makeFixture();
    const missing = registry.resolve(gridHandle, source());
    expect(missing).toMatchObject({
      ok: false,
      availability: "unavailable",
      handle: gridHandle,
      source: source(),
      reason: "missing",
      metadata: null,
    });
    expect(Object.isFrozen(missing)).toBe(true);
  });

  it("enforces cache ownership and performs sorted idempotent owner cleanup", () => {
    const { registry } = makeFixture();
    declare(registry, meshHandle);
    declare(registry, gridHandle);
    expect(() => registry.remove(gridHandle.artifactId, "cache:other")).toThrow(/another cache owner/);
    expect(() => declare(registry, gridHandle, source(), "cache:other")).toThrow(/another cache owner/);

    expect(registry.releaseOwner("cache:topology")).toEqual(["artifact:grid:a", "artifact:mesh:a"]);
    expect(registry.releaseOwner("cache:topology")).toEqual([]);
    expect(registry.listMetadata()).toEqual([]);
  });

  it("emits ordered immutable metadata-only facts and isolates listeners", () => {
    const { registry } = makeFixture();
    const events: ArtifactRegistryEvent[] = [];
    let nestedMutationBlocked = false;
    registry.subscribe((event) => {
      expect(JSON.stringify(event)).not.toContain('"bytes"');
      expect(() => (event.metadata as { status: string }).status = "failed").toThrow();
      try {
        registry.remove(event.artifactId, event.metadata.ownerId);
      } catch {
        nestedMutationBlocked = true;
      }
      throw new Error("diagnostic listener failure");
    });
    const unsubscribe = registry.subscribe((event) => events.push(event));

    declare(registry);
    registry.beginComputation(gridHandle.artifactId, "cache:topology", source());
    registry.publish({
      artifactId: gridHandle.artifactId,
      source: source(),
      ownerId: "cache:topology",
      bytes: new Uint8Array([1]),
    });
    unsubscribe();
    unsubscribe();
    registry.remove(gridHandle.artifactId, "cache:topology");

    expect(nestedMutationBlocked).toBe(true);
    expect(events.map((event) => `${event.sequence}:${event.type}`)).toEqual([
      "1:artifact.declared",
      "2:artifact.computing",
      "3:artifact.published",
    ]);
  });
});
