export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export const DOCUMENT_IDENTITY_SCHEMA_VERSION = 1 as const;
export const STRUCTURAL_HASH_ALGORITHM = "sha256" as const;

export type StableDocumentId = `math3d:${string}:${string}`;
export type StructuralHash = `${typeof STRUCTURAL_HASH_ALGORITHM}:${string}`;

export type DocumentIdentity = Readonly<{
  schemaVersion: typeof DOCUMENT_IDENTITY_SCHEMA_VERSION;
  id: StableDocumentId;
  revision: number;
  structuralHash: StructuralHash;
}>;

export const DOCUMENT_FIELD_AUTHORITIES = [
  "structural",
  "persistent-metadata",
  "persistent-display",
  "transient-display",
] as const;

export type DocumentFieldAuthority = (typeof DOCUMENT_FIELD_AUTHORITIES)[number];
export type DocumentFieldPolicy = Readonly<Record<string, DocumentFieldAuthority>>;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const canonicalJson = (value: unknown, ancestors: Set<object>, path: string): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite JSON numbers.`);
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} contains unsupported JSON value type '${typeof value}'.`);
  }
  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference.`);
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value).filter((key) => key !== "length");
      const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
      if (
        ownKeys.some((key) => typeof key !== "string") ||
        ownKeys.some((key) => typeof key === "string" && !expectedKeys.includes(key)) ||
        expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
      ) {
        throw new TypeError(`${path} must be a dense JSON array without custom properties.`);
      }
      return `[${value.map((entry, index) => canonicalJson(entry, ancestors, `${path}[${index}]`)).join(",")}]`;
    }

    if (!isPlainObject(value)) throw new TypeError(`${path} must contain only plain JSON objects.`);
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`${path} must not contain symbol keys.`);
    }

    const keys = Object.keys(value).sort();
    const allNames = Object.getOwnPropertyNames(value);
    if (allNames.length !== keys.length) {
      throw new TypeError(`${path} must not contain non-enumerable fields.`);
    }
    const fields = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        throw new TypeError(`${path}.${key} must be a JSON data field, not an accessor.`);
      }
      return `${JSON.stringify(key)}:${canonicalJson(descriptor.value, ancestors, `${path}.${key}`)}`;
    });
    return `{${fields.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
};

/** RFC-8259-compatible JSON with recursively sorted object keys and preserved array order. */
export const canonicalJsonStringify = (value: unknown): string =>
  canonicalJson(value, new Set<object>(), "$source");

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const rotateRight = (value: number, count: number): number =>
  (value >>> count) | (value << (32 - count));

const sha256 = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = paddedView.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15]!;
      const word2 = words[index - 2]!;
      const sigma0 = rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const sigma1 = rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + sum1 + choice + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0]! + a!) >>> 0;
    state[1] = (state[1]! + b!) >>> 0;
    state[2] = (state[2]! + c!) >>> 0;
    state[3] = (state[3]! + d!) >>> 0;
    state[4] = (state[4]! + e!) >>> 0;
    state[5] = (state[5]! + f!) >>> 0;
    state[6] = (state[6]! + g!) >>> 0;
    state[7] = (state[7]! + h!) >>> 0;
  }

  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
};

/** Hashes only canonical JSON, so object insertion order and runtime identity are irrelevant. */
export const structuralHash = (source: unknown): StructuralHash =>
  `${STRUCTURAL_HASH_ALGORITHM}:${sha256(canonicalJsonStringify(source))}`;

const STABLE_ID_KIND = /^[a-z][a-z0-9-]{0,31}$/;
const STABLE_DOCUMENT_ID = /^math3d:[a-z][a-z0-9-]{0,31}:[0-9a-f]{32}$/;
const STRUCTURAL_HASH = /^sha256:[0-9a-f]{64}$/;

/** Deterministic ID for a persistent external key, import locator, or fixture seed. */
export const createStableDocumentId = (kind: string, stableKey: CanonicalJsonValue): StableDocumentId => {
  if (!STABLE_ID_KIND.test(kind)) {
    throw new TypeError("Document ID kind must start with a lowercase letter and contain only lowercase letters, digits, or '-'.");
  }
  const prefixLength = `${STRUCTURAL_HASH_ALGORITHM}:`.length;
  const digest = structuralHash({ kind, stableKey }).slice(prefixLength, prefixLength + 32);
  return `math3d:${kind}:${digest}`;
};

export const isStableDocumentId = (value: unknown): value is StableDocumentId =>
  typeof value === "string" && STABLE_DOCUMENT_ID.test(value);

export const isStructuralHash = (value: unknown): value is StructuralHash =>
  typeof value === "string" && STRUCTURAL_HASH.test(value);

export const isDocumentIdentity = (value: unknown): value is DocumentIdentity =>
  isPlainObject(value) &&
  value.schemaVersion === DOCUMENT_IDENTITY_SCHEMA_VERSION &&
  isStableDocumentId(value.id) &&
  Number.isSafeInteger(value.revision) &&
  (value.revision as number) >= 1 &&
  isStructuralHash(value.structuralHash);

export const createDocumentIdentity = (
  id: StableDocumentId,
  source: unknown,
  revision = 1
): DocumentIdentity => {
  if (!isStableDocumentId(id)) throw new TypeError("Document identity requires a valid stable document ID.");
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new TypeError("Document revision must be a positive safe integer.");
  }
  return Object.freeze({
    schemaVersion: DOCUMENT_IDENTITY_SCHEMA_VERSION,
    id,
    revision,
    structuralHash: structuralHash(source),
  });
};

/** Advances exactly once when structural source changes; identical source is a no-op. */
export const advanceDocumentIdentity = (identity: DocumentIdentity, source: unknown): DocumentIdentity => {
  if (!isDocumentIdentity(identity)) throw new TypeError("Cannot advance an invalid document identity.");
  const nextHash = structuralHash(source);
  if (nextHash === identity.structuralHash) return identity;
  if (identity.revision === Number.MAX_SAFE_INTEGER) throw new RangeError("Document revision is exhausted.");
  return Object.freeze({ ...identity, revision: identity.revision + 1, structuralHash: nextHash });
};

export const defineDocumentFieldPolicy = <Policy extends Record<string, DocumentFieldAuthority>>(
  policy: Policy
): Readonly<Policy> => {
  for (const [field, authority] of Object.entries(policy)) {
    if (!field) throw new TypeError("Document field policy cannot contain an empty field name.");
    if (!(DOCUMENT_FIELD_AUTHORITIES as readonly string[]).includes(authority)) {
      throw new TypeError(`Unknown authority '${String(authority)}' for document field '${field}'.`);
    }
  }
  return Object.freeze({ ...policy });
};

const assertPolicyCoversDocument = (document: Record<string, unknown>, policy: DocumentFieldPolicy): void => {
  const unclassified = Object.keys(document).filter(
    (field) => !Object.prototype.hasOwnProperty.call(policy, field)
  );
  if (unclassified.length > 0) {
    throw new TypeError(`Document field policy does not classify: ${unclassified.sort().join(", ")}.`);
  }
};

export const selectStructuralDocumentFields = (
  document: Record<string, unknown>,
  policy: DocumentFieldPolicy
): Record<string, unknown> => {
  assertPolicyCoversDocument(document, policy);
  return Object.fromEntries(
    Object.entries(policy)
      .filter(([, authority]) => authority === "structural")
      .filter(([field]) => Object.prototype.hasOwnProperty.call(document, field))
      .map(([field]) => [field, document[field]])
  );
};

/** Returns the serialization-safe document projection, omitting only transient display fields. */
export const selectPersistentDocumentFields = (
  document: Record<string, unknown>,
  policy: DocumentFieldPolicy
): Record<string, unknown> => {
  assertPolicyCoversDocument(document, policy);
  return Object.fromEntries(
    Object.entries(policy)
      .filter(([, authority]) => authority !== "transient-display")
      .filter(([field]) => Object.prototype.hasOwnProperty.call(document, field))
      .map(([field]) => [field, document[field]])
  );
};

export const structuralDocumentHash = (
  document: Record<string, unknown>,
  policy: DocumentFieldPolicy
): StructuralHash => structuralHash(selectStructuralDocumentFields(document, policy));
