import { analyzeQuadraticNumberField, type QuadraticNumberFieldFacts } from "./quadraticNumberField";

/** A bounded quadratic extension K(b), b²=m, of a saved quadratic field K=QQ(a). */
export type BiquadraticExtensionFacts = Readonly<{
  radicand: string; generator: string; relativePolynomial: string;
  baseDegree: 2; relativeDegree: 2; absoluteDegree: 4;
  absoluteBasis: readonly ["1", string, string, string];
  baseGeneratorImage: readonly ["0", "1", "0", "0"];
  extensionGeneratorImage: readonly ["0", "0", "1", "0"];
  baseRelation: string; extensionRelation: string;
}>;

const squarefree = (value: number): boolean => {
  for (let factor = 2; factor * factor <= value; factor += 1)
    if (value % (factor * factor) === 0) return false;
  return true;
};
export const requireBiquadraticRadicand = (value: unknown): string => {
  if (typeof value !== "string" || !/^(?:[2-9]|[1-9][0-9])$/.test(value) ||
      Number(value) > 97 || !squarefree(Number(value)))
    throw new TypeError("Tower radicand must be a positive squarefree integer from 2 to 97.");
  return value;
};
export const requireBiquadraticGenerator = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value))
    throw new TypeError("Tower generator must be an ASCII identifier of at most 32 characters.");
  return value;
};

/** Proves [K(b):K]=2: a positive squarefree m is square in K exactly when K=QQ(√m). */
export const analyzeBiquadraticExtension = (base: QuadraticNumberFieldFacts, radicand: unknown,
  generator: unknown): BiquadraticExtensionFacts => {
  const m = requireBiquadraticRadicand(radicand), name = requireBiquadraticGenerator(generator);
  if (m === base.squarefreeRadicand)
    throw new TypeError("This radicand is already a square in the selected base field.");
  if (name === base.generator)
    throw new TypeError("Tower generator must be a distinct ASCII identifier of at most 32 characters.");
  const b = BigInt(base.coefficients[1]), c = BigInt(base.coefficients[0]);
  return Object.freeze({ radicand: m, generator: name, relativePolynomial: `t^2 - ${m}`,
    baseDegree: 2, relativeDegree: 2, absoluteDegree: 4,
    absoluteBasis: ["1", base.generator, name, `${base.generator}*${name}`] as const,
    baseGeneratorImage: ["0", "1", "0", "0"] as const,
    extensionGeneratorImage: ["0", "0", "1", "0"] as const,
    baseRelation: `${base.generator}^2${b === 0n ? "" : b < 0n ? ` - ${-b}*${base.generator}` : ` + ${b}*${base.generator}`}` +
      `${c === 0n ? "" : c < 0n ? ` - ${-c}` : ` + ${c}`} = 0`,
    extensionRelation: `${name}^2 - ${m} = 0` });
};

export const analyzeBiquadraticExtensionFromDefinition = (baseCoefficients: unknown, baseGenerator: unknown,
  radicand: unknown, generator: unknown): BiquadraticExtensionFacts =>
  analyzeBiquadraticExtension(analyzeQuadraticNumberField(baseCoefficients, baseGenerator), radicand, generator);
