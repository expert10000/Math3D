import {
  ANALYSIS_ARTIFACT_KINDS,
  immutableCanonicalJsonClone,
  isScientificSourceGeneration,
  matchesScientificSourceGeneration,
  sha256Checksum,
  type AnalysisArtifactHandle,
  type ScientificSourceGeneration,
  type StableDocumentId,
  type StructuralHash,
} from "@math3d/core";

export const ARTIFACT_REGISTRY_SCHEMA_VERSION = 1 as const;
export const MANAGED_ARTIFACT_STATUSES = ["clean", "dirty", "computing", "failed"] as const;

export type ManagedArtifactStatus = (typeof MANAGED_ARTIFACT_STATUSES)[number];
export type ManagedArtifactAvailability = "available" | "unavailable";

export type ManagedArtifactFailure = Readonly<{
  code: string;
  message: string;
}>;

export type ManagedArtifactMetadata = Readonly<{
  schemaVersion: typeof ARTIFACT_REGISTRY_SCHEMA_VERSION;
  handle: AnalysisArtifactHandle;
  source: ScientificSourceGeneration;
  ownerId: string;
  encoding: string;
  availability: ManagedArtifactAvailability;
  status: ManagedArtifactStatus;
  byteLength: number | null;
  checksum: StructuralHash | null;
  failure?: ManagedArtifactFailure;
}>;

export const ARTIFACT_REGISTRY_EVENT_TYPES = [
  "artifact.declared",
  "artifact.computing",
  "artifact.published",
  "artifact.failed",
  "artifact.invalidated",
  "artifact.removed",
] as const;

export type ArtifactRegistryEventType = (typeof ARTIFACT_REGISTRY_EVENT_TYPES)[number];

export type ArtifactRegistryEvent = Readonly<{
  schemaVersion: typeof ARTIFACT_REGISTRY_SCHEMA_VERSION;
  sequence: number;
  type: ArtifactRegistryEventType;
  artifactId: string;
  metadata: ManagedArtifactMetadata;
}>;

export type ArtifactRegistryListener = (event: ArtifactRegistryEvent) => void;

export type ArtifactDeclaration = Readonly<{
  handle: AnalysisArtifactHandle;
  source: ScientificSourceGeneration;
  ownerId: string;
  encoding: string;
}>;

export type ArtifactPublication = Readonly<{
  artifactId: string;
  source: ScientificSourceGeneration;
  ownerId: string;
  bytes: Uint8Array;
}>;

export type ArtifactFailurePublication = Readonly<{
  artifactId: string;
  source: ScientificSourceGeneration;
  ownerId: string;
  failure: ManagedArtifactFailure;
}>;

export type ArtifactUnavailableReason =
  | "missing"
  | "stale-source"
  | "source-mismatch"
  | "handle-mismatch"
  | "dirty"
  | "computing"
  | "failed";

export type ArtifactResolution =
  | Readonly<{
      ok: true;
      availability: "available";
      metadata: ManagedArtifactMetadata;
      bytes: Uint8Array;
    }>
  | Readonly<{
      ok: false;
      availability: "unavailable";
      handle: AnalysisArtifactHandle;
      source: ScientificSourceGeneration;
      reason: ArtifactUnavailableReason;
      metadata: ManagedArtifactMetadata | null;
    }>;

export type InMemoryArtifactRegistryOptions = Readonly<{
  resolveSource: (documentId: StableDocumentId) => ScientificSourceGeneration | null;
  maxArtifactBytes?: number;
}>;

type StoredArtifact = {
  metadata: ManagedArtifactMetadata;
  bytes: Uint8Array | null;
};

const DEFAULT_MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const HANDLE_FIELDS = new Set(["artifactId", "kind", "role"]);
const FAILURE_FIELDS = new Set(["code", "message"]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOnlyFields = (value: Record<string, unknown>, fields: ReadonlySet<string>): boolean =>
  Object.keys(value).every((field) => fields.has(field));

const isBoundedString = (value: unknown, maximum: number): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum;

const isHandle = (value: unknown): value is AnalysisArtifactHandle =>
  isRecord(value) &&
  hasOnlyFields(value, HANDLE_FIELDS) &&
  Object.keys(value).length === HANDLE_FIELDS.size &&
  typeof value.artifactId === "string" &&
  SAFE_ID.test(value.artifactId) &&
  (ANALYSIS_ARTIFACT_KINDS as readonly unknown[]).includes(value.kind) &&
  isBoundedString(value.role, 120);

const sameHandle = (left: AnalysisArtifactHandle, right: AnalysisArtifactHandle): boolean =>
  left.artifactId === right.artifactId && left.kind === right.kind && left.role === right.role;

const validateOwnerId: (value: unknown) => asserts value is string = (value) => {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new TypeError("ownerId must be an ID-safe string of at most 160 characters.");
  }
};

const validateArtifactId: (value: unknown) => asserts value is string = (value) => {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new TypeError("artifactId must be an ID-safe string of at most 160 characters.");
  }
};

const validateSource: (value: unknown) => asserts value is ScientificSourceGeneration = (value) => {
  if (!isScientificSourceGeneration(value)) {
    throw new TypeError("Artifact source must be an exact scientific source generation.");
  }
};

const validateFailure: (value: unknown) => asserts value is ManagedArtifactFailure = (value) => {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, FAILURE_FIELDS) ||
    Object.keys(value).length !== FAILURE_FIELDS.size ||
    !isBoundedString(value.code, 120) ||
    !isBoundedString(value.message, 1_000)
  ) {
    throw new TypeError("Artifact failure requires bounded non-empty code and message fields.");
  }
};

const immutableMetadata = (value: ManagedArtifactMetadata): ManagedArtifactMetadata =>
  immutableCanonicalJsonClone(value) as ManagedArtifactMetadata;

const withoutFailure = (
  metadata: ManagedArtifactMetadata
): Omit<ManagedArtifactMetadata, "failure"> => {
  const { failure: _failure, ...rest } = metadata;
  return rest;
};

export class InMemoryArtifactRegistry {
  readonly #resolveSource: InMemoryArtifactRegistryOptions["resolveSource"];
  readonly #maxArtifactBytes: number;
  readonly #artifacts = new Map<string, StoredArtifact>();
  readonly #listeners = new Map<number, ArtifactRegistryListener>();
  #nextSubscriberId = 1;
  #eventSequence = 0;
  #emitting = false;

  constructor(options: InMemoryArtifactRegistryOptions) {
    const maximum = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
    if (!Number.isSafeInteger(maximum) || maximum < 1) {
      throw new RangeError("maxArtifactBytes must be a positive safe integer.");
    }
    this.#resolveSource = options.resolveSource;
    this.#maxArtifactBytes = maximum;
  }

  subscribe(listener: ArtifactRegistryListener): () => void {
    const subscriberId = this.#nextSubscriberId;
    this.#nextSubscriberId += 1;
    this.#listeners.set(subscriberId, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(subscriberId);
    };
  }

  declare(declaration: ArtifactDeclaration): ManagedArtifactMetadata {
    this.#assertMutationAllowed();
    if (!isHandle(declaration.handle)) throw new TypeError("Artifact declaration requires a valid F06 handle.");
    validateSource(declaration.source);
    validateOwnerId(declaration.ownerId);
    if (!isBoundedString(declaration.encoding, 160)) {
      throw new TypeError("Artifact encoding must be a non-empty string of at most 160 characters.");
    }
    this.#assertCurrentSource(declaration.source);

    const artifactId = declaration.handle.artifactId;
    const existing = this.#artifacts.get(artifactId);
    if (existing) {
      this.#assertOwner(existing, declaration.ownerId);
      if (!sameHandle(existing.metadata.handle, declaration.handle)) {
        throw new TypeError(`Artifact '${artifactId}' is already declared with a different handle.`);
      }
      if (existing.metadata.encoding !== declaration.encoding) {
        throw new TypeError(`Artifact '${artifactId}' is already declared with a different encoding.`);
      }
      if (matchesScientificSourceGeneration(existing.metadata.source, declaration.source)) {
        return existing.metadata;
      }
    }

    const metadata = immutableMetadata({
      schemaVersion: ARTIFACT_REGISTRY_SCHEMA_VERSION,
      handle: declaration.handle,
      source: declaration.source,
      ownerId: declaration.ownerId,
      encoding: declaration.encoding,
      availability: "unavailable",
      status: "dirty",
      byteLength: null,
      checksum: null,
    });
    this.#artifacts.set(artifactId, { metadata, bytes: null });
    this.#emit("artifact.declared", metadata);
    return metadata;
  }

  beginComputation(
    artifactId: string,
    ownerId: string,
    source: ScientificSourceGeneration
  ): ManagedArtifactMetadata {
    this.#assertMutationAllowed();
    const stored = this.#ownedCurrentArtifact(artifactId, ownerId, source);
    if (stored.metadata.status === "computing" && stored.metadata.availability === "unavailable") {
      return stored.metadata;
    }
    const metadata = immutableMetadata({
      ...withoutFailure(stored.metadata),
      availability: "unavailable",
      status: "computing",
      byteLength: null,
      checksum: null,
    });
    stored.metadata = metadata;
    stored.bytes = null;
    this.#emit("artifact.computing", metadata);
    return metadata;
  }

  publish(publication: ArtifactPublication): ManagedArtifactMetadata {
    this.#assertMutationAllowed();
    const stored = this.#ownedCurrentArtifact(
      publication.artifactId,
      publication.ownerId,
      publication.source
    );
    if (!(publication.bytes instanceof Uint8Array)) {
      throw new TypeError("Artifact publication bytes must be a Uint8Array.");
    }
    if (publication.bytes.byteLength > this.#maxArtifactBytes) {
      throw new RangeError(`Artifact exceeds maxArtifactBytes (${this.#maxArtifactBytes}).`);
    }
    const bytes = new Uint8Array(publication.bytes);
    const metadata = immutableMetadata({
      ...withoutFailure(stored.metadata),
      availability: "available",
      status: "clean",
      byteLength: bytes.byteLength,
      checksum: sha256Checksum(bytes),
    });
    stored.metadata = metadata;
    stored.bytes = bytes;
    this.#emit("artifact.published", metadata);
    return metadata;
  }

  fail(publication: ArtifactFailurePublication): ManagedArtifactMetadata {
    this.#assertMutationAllowed();
    const stored = this.#ownedCurrentArtifact(
      publication.artifactId,
      publication.ownerId,
      publication.source
    );
    validateFailure(publication.failure);
    const metadata = immutableMetadata({
      ...stored.metadata,
      availability: "unavailable",
      status: "failed",
      byteLength: null,
      checksum: null,
      failure: publication.failure,
    });
    stored.metadata = metadata;
    stored.bytes = null;
    this.#emit("artifact.failed", metadata);
    return metadata;
  }

  /** Invalidates all and only non-current artifacts declared for this document. */
  invalidateDocumentSource(currentSource: ScientificSourceGeneration): readonly string[] {
    this.#assertMutationAllowed();
    validateSource(currentSource);
    this.#assertCurrentSource(currentSource);
    const invalidated: string[] = [];
    const candidates = [...this.#artifacts.entries()]
      .filter(([, stored]) => stored.metadata.source.documentId === currentSource.documentId)
      .filter(([, stored]) => !matchesScientificSourceGeneration(stored.metadata.source, currentSource))
      .sort(([left], [right]) => left.localeCompare(right));

    for (const [artifactId, stored] of candidates) {
      const alreadyInvalid =
        stored.metadata.status === "dirty" &&
        stored.metadata.availability === "unavailable" &&
        stored.metadata.byteLength === null &&
        stored.metadata.checksum === null &&
        stored.metadata.failure === undefined &&
        stored.bytes === null;
      if (alreadyInvalid) continue;
      const metadata = immutableMetadata({
        ...withoutFailure(stored.metadata),
        availability: "unavailable",
        status: "dirty",
        byteLength: null,
        checksum: null,
      });
      stored.metadata = metadata;
      stored.bytes = null;
      invalidated.push(artifactId);
      this.#emit("artifact.invalidated", metadata);
    }
    return Object.freeze(invalidated);
  }

  /**
   * Invalidates explicit artifact handles selected by the dependency graph.
   * F07 remains the sole owner of bytes and lifecycle metadata; callers only
   * provide stable IDs and never receive mutable storage references.
   */
  invalidateArtifacts(artifactIds: readonly string[]): readonly string[] {
    this.#assertMutationAllowed();
    if (!Array.isArray(artifactIds)) throw new TypeError("artifactIds must be an array.");
    const requested = [...new Set(artifactIds)];
    for (const artifactId of requested) validateArtifactId(artifactId);
    requested.sort((left, right) => left.localeCompare(right));
    const invalidated: string[] = [];
    for (const artifactId of requested) {
      const stored = this.#artifacts.get(artifactId);
      if (!stored) continue;
      const alreadyInvalid =
        stored.metadata.status === "dirty" &&
        stored.metadata.availability === "unavailable" &&
        stored.metadata.byteLength === null &&
        stored.metadata.checksum === null &&
        stored.metadata.failure === undefined &&
        stored.bytes === null;
      if (alreadyInvalid) continue;
      const metadata = immutableMetadata({
        ...withoutFailure(stored.metadata),
        availability: "unavailable",
        status: "dirty",
        byteLength: null,
        checksum: null,
      });
      stored.metadata = metadata;
      stored.bytes = null;
      invalidated.push(artifactId);
      this.#emit("artifact.invalidated", metadata);
    }
    return Object.freeze(invalidated);
  }

  resolve(
    handle: AnalysisArtifactHandle,
    source: ScientificSourceGeneration
  ): ArtifactResolution {
    if (!isHandle(handle)) throw new TypeError("Artifact resolution requires a valid F06 handle.");
    validateSource(source);
    const current = this.#readCurrentSource(source.documentId);
    const stored = this.#artifacts.get(handle.artifactId);
    if (!current || !matchesScientificSourceGeneration(source, current)) {
      return this.#unavailable(handle, source, "stale-source", stored?.metadata ?? null);
    }
    if (!stored) return this.#unavailable(handle, source, "missing", null);
    if (!sameHandle(handle, stored.metadata.handle)) {
      return this.#unavailable(handle, source, "handle-mismatch", stored.metadata);
    }
    if (!matchesScientificSourceGeneration(source, stored.metadata.source)) {
      return this.#unavailable(handle, source, "source-mismatch", stored.metadata);
    }
    if (
      stored.metadata.availability !== "available" ||
      stored.metadata.status !== "clean" ||
      stored.bytes === null
    ) {
      const reason = stored.metadata.status === "clean" ? "dirty" : stored.metadata.status;
      return this.#unavailable(handle, source, reason, stored.metadata);
    }
    return {
      ok: true,
      availability: "available",
      metadata: stored.metadata,
      bytes: new Uint8Array(stored.bytes),
    };
  }

  listMetadata(documentId?: StableDocumentId): readonly ManagedArtifactMetadata[] {
    return Object.freeze(
      [...this.#artifacts.values()]
        .map((stored) => stored.metadata)
        .filter((metadata) => documentId === undefined || metadata.source.documentId === documentId)
        .sort((left, right) => left.handle.artifactId.localeCompare(right.handle.artifactId))
    );
  }

  remove(artifactId: string, ownerId: string): boolean {
    this.#assertMutationAllowed();
    validateArtifactId(artifactId);
    validateOwnerId(ownerId);
    const stored = this.#artifacts.get(artifactId);
    if (!stored) return false;
    this.#assertOwner(stored, ownerId);
    this.#artifacts.delete(artifactId);
    stored.bytes = null;
    this.#emit("artifact.removed", stored.metadata);
    return true;
  }

  releaseOwner(ownerId: string): readonly string[] {
    this.#assertMutationAllowed();
    validateOwnerId(ownerId);
    const artifactIds = [...this.#artifacts.entries()]
      .filter(([, stored]) => stored.metadata.ownerId === ownerId)
      .map(([artifactId]) => artifactId)
      .sort();
    for (const artifactId of artifactIds) this.remove(artifactId, ownerId);
    return Object.freeze(artifactIds);
  }

  #ownedCurrentArtifact(
    artifactId: string,
    ownerId: string,
    source: ScientificSourceGeneration
  ): StoredArtifact {
    validateArtifactId(artifactId);
    validateOwnerId(ownerId);
    validateSource(source);
    this.#assertCurrentSource(source);
    const stored = this.#artifacts.get(artifactId);
    if (!stored) throw new TypeError(`Artifact '${artifactId}' is not declared.`);
    this.#assertOwner(stored, ownerId);
    if (!matchesScientificSourceGeneration(stored.metadata.source, source)) {
      throw new TypeError(`Artifact '${artifactId}' is declared for a different source generation.`);
    }
    return stored;
  }

  #assertOwner(stored: StoredArtifact, ownerId: string): void {
    if (stored.metadata.ownerId !== ownerId) {
      throw new TypeError(`Artifact '${stored.metadata.handle.artifactId}' belongs to another cache owner.`);
    }
  }

  #readCurrentSource(documentId: StableDocumentId): ScientificSourceGeneration | null {
    try {
      const source = this.#resolveSource(documentId);
      return isScientificSourceGeneration(source) ? source : null;
    } catch {
      return null;
    }
  }

  #assertCurrentSource(source: ScientificSourceGeneration): void {
    const current = this.#readCurrentSource(source.documentId);
    if (!current || !matchesScientificSourceGeneration(source, current)) {
      throw new TypeError("Artifact operation source is not the current scientific source generation.");
    }
  }

  #unavailable(
    handle: AnalysisArtifactHandle,
    source: ScientificSourceGeneration,
    reason: ArtifactUnavailableReason,
    metadata: ManagedArtifactMetadata | null
  ): ArtifactResolution {
    return immutableCanonicalJsonClone({
      ok: false as const,
      availability: "unavailable" as const,
      handle,
      source,
      reason,
      metadata,
    }) as ArtifactResolution;
  }

  #emit(type: ArtifactRegistryEventType, metadata: ManagedArtifactMetadata): void {
    this.#eventSequence += 1;
    const event = immutableCanonicalJsonClone({
      schemaVersion: ARTIFACT_REGISTRY_SCHEMA_VERSION,
      sequence: this.#eventSequence,
      type,
      artifactId: metadata.handle.artifactId,
      metadata,
    }) as ArtifactRegistryEvent;
    const listeners = [...this.#listeners.values()];
    this.#emitting = true;
    try {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Diagnostic listeners cannot change lifecycle completion or later delivery.
        }
      }
    } finally {
      this.#emitting = false;
    }
  }

  #assertMutationAllowed(): void {
    if (this.#emitting) throw new TypeError("Artifact registry mutation is not allowed during event delivery.");
  }
}

export const createInMemoryArtifactRegistry = (
  options: InMemoryArtifactRegistryOptions
): InMemoryArtifactRegistry => new InMemoryArtifactRegistry(options);
