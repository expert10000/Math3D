import type { TopologyResult, TopologyResultStatus } from "./contracts";

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
};

export const hashTopologyValue = (value: unknown): string => {
  const serialized = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const createTopologyResult = <T>(input: {
  status: TopologyResultStatus;
  value?: T;
  method: string;
  assumptions?: string[];
  sourceRevision: string;
  algorithmVersion: string;
  diagnostics?: TopologyResult<T>["diagnostics"];
}): TopologyResult<T> => ({
  status: input.status,
  ...(input.value === undefined ? {} : { value: input.value }),
  method: input.method,
  assumptions: [...(input.assumptions ?? [])],
  sourceRevision: input.sourceRevision,
  algorithmVersion: input.algorithmVersion,
  diagnostics: [...(input.diagnostics ?? [])],
});
