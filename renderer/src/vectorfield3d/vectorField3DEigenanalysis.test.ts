import { describe, expect, it } from "vitest";
import { analyzeVectorField3DEigenvalues } from "../../../packages/core/src/vectorField3DEigenanalysis";

describe("SCI-14 point Jacobian eigenanalysis", () => {
  it("resolves a complex conjugate pair and an independent real root", () => {
    const result = analyzeVectorField3DEigenvalues([[0, -2, 0], [2, 0, 0], [0, 0, .25]], "1/s");
    expect(result.status).toBe("resolved");
    expect(result.eigenvalues?.[0].real).toBeCloseTo(.25, 12);
    expect(result.eigenvalues?.[1].real).toBeCloseTo(0, 12);
    expect(result.eigenvalues?.[1].imaginary).toBeCloseTo(2, 12);
    expect(result.eigenvalues?.[2].real).toBeCloseTo(0, 12);
    expect(result.eigenvalues?.[2].imaginary).toBeCloseTo(-2, 12);
  });

  it("sorts three real roots and warns on ill-conditioning or repeated roots", () => {
    const real = analyzeVectorField3DEigenvalues([[3, 0, 0], [0, -2, 0], [0, 0, 1]], "1/s");
    expect(real.status).toBe("resolved");
    real.eigenvalues?.forEach((value, index) =>
      expect(value.real).toBeCloseTo([-2, 1, 3][index]!, 10));
    expect(real.eigenvalues?.every(value => value.imaginary === 0)).toBe(true);
    expect(analyzeVectorField3DEigenvalues([[1, 0, 0], [0, 1, 0], [0, 0, 1e-12]], "1/s")
      .status).toBe("uncertain");
    expect(analyzeVectorField3DEigenvalues([[1, 0, 0], [0, 1, 0], [0, 0, 1]], "1/s")
      .status).toBe("uncertain");
  });

  it("does not assign physical eigenvalues to incompatible units", () => {
    expect(analyzeVectorField3DEigenvalues([[1, 0, 0], [0, 1, 0], [0, 0, 1]], null)
      .eigenvalues).toBeNull();
  });
});
