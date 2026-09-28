import { expect } from "@playwright/test";
export function comparePortable(actual: unknown, expected: unknown, path = "series") {
  if (typeof expected === "number") { expect(typeof actual, path).toBe("number");
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(Math.max(1e-8, Math.abs(expected) * 1e-12)); return; }
  if (Array.isArray(expected)) { expect(Array.isArray(actual), path).toBe(true); expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((value, index) => comparePortable((actual as unknown[])[index], value, `${path}[${index}]`)); return; }
  if (expected && typeof expected === "object") { expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) comparePortable((actual as Record<string, unknown>)[key], value, `${path}.${key}`); return; }
  expect(actual, path).toEqual(expected);
}
