import { describe, expect, it } from "vitest";
import { presentProjectResultVerification } from "./projectResultVerification";

describe("Project result verification scope", () => {
  it("does not turn a current source or saved-byte check into mathematical proof", () => {
    const field = presentProjectResultVerification({ kind: "field", sourceCurrent: true });
    const mesh = presentProjectResultVerification({ kind: "mesh", savedMeshChecked: true });
    expect(field.scope).toBe("source-only");
    expect(field.detail).toMatch(/not independently recomputed/);
    expect(mesh.scope).toBe("saved-bytes");
    expect(mesh.detail).toMatch(/not proved/);
  });

  it("keeps unavailable evidence and unchecked results distinct", () => {
    expect(presentProjectResultVerification({ kind: "mesh" }).scope).toBe("unavailable");
    expect(presentProjectResultVerification({ kind: "field", sourceCurrent: false }).scope)
      .toBe("unavailable");
    expect(presentProjectResultVerification({ kind: "other" }).scope).toBe("not-checked");
  });
});
