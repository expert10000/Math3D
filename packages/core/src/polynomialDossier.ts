/** Exact, bounded QQ[x] analysis returned by the Sage polynomial dossier recipe. */
export type PolynomialDossierFactor = Readonly<{ polynomial: string; multiplicity: number }>;
export type PolynomialDossierResult = Readonly<{
  schemaVersion: 1;
  coefficientDomain: "QQ";
  variable: string;
  sourcePolynomial: string;
  polynomial: string;
  degree: number;
  leadingCoefficient: string;
  constantCoefficient: string;
  content: string;
  primitivePart: string;
  derivative: string;
  derivativeGcd: string;
  squareFree: boolean;
  squareFreeDecomposition: Readonly<{ unit: string; factors: readonly PolynomialDossierFactor[] }>;
  factorization: Readonly<{ unit: string; factors: readonly PolynomialDossierFactor[] }>;
  irreducibleOverQQ: boolean;
  discriminant: string | null;
  rationalRoots: readonly Readonly<{ value: string; multiplicity: number }>[];
}>;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...fields].sort().join("|");
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096;
const multiplicity = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 16;
const factorList = (value: unknown): value is { unit: string; factors: PolynomialDossierFactor[] } =>
  record(value) && exact(value, ["unit", "factors"]) && text(value.unit) &&
  Array.isArray(value.factors) && value.factors.length <= 16 && value.factors.every((part) =>
    record(part) && exact(part, ["polynomial", "multiplicity"]) && text(part.polynomial) && multiplicity(part.multiplicity));
const rootList = (value: unknown): value is { value: string; multiplicity: number }[] =>
  Array.isArray(value) && value.length <= 16 && value.every((root) => record(root) &&
    exact(root, ["value", "multiplicity"]) && typeof root.value === "string" &&
    /^-?(?:0|[1-9][0-9]*)(?:\/[1-9][0-9]*)?$/.test(root.value) && root.value.length <= 128 &&
    multiplicity(root.multiplicity));

/** Rejects extra fields, changed domains and malformed results before any dossier is retained. */
export const parsePolynomialDossierResult = (value: unknown, variable: string, sourcePolynomial: string): PolynomialDossierResult => {
  if (!record(value) || !exact(value, ["schemaVersion", "coefficientDomain", "variable", "sourcePolynomial", "polynomial", "degree",
    "leadingCoefficient", "constantCoefficient", "content", "primitivePart", "derivative", "derivativeGcd",
    "squareFree", "squareFreeDecomposition", "factorization", "irreducibleOverQQ", "discriminant", "rationalRoots"]) ||
    value.schemaVersion !== 1 || value.coefficientDomain !== "QQ" || value.variable !== variable ||
    !text(value.sourcePolynomial) || value.sourcePolynomial !== sourcePolynomial ||
    !text(value.polynomial) || !Number.isSafeInteger(value.degree) || (value.degree as number) < 0 || (value.degree as number) > 16 ||
    !text(value.leadingCoefficient) || !text(value.constantCoefficient) || !text(value.content) ||
    !text(value.primitivePart) || !text(value.derivative) || !text(value.derivativeGcd) ||
    typeof value.squareFree !== "boolean" || !factorList(value.squareFreeDecomposition) ||
    !factorList(value.factorization) || typeof value.irreducibleOverQQ !== "boolean" ||
    ((value.degree as number) < 2 ? value.discriminant !== null : !text(value.discriminant)) ||
    !rootList(value.rationalRoots)) {
    throw new TypeError("Invalid exact polynomial dossier result or mismatched QQ[x] parent.");
  }
  return Object.freeze({ ...value,
    squareFreeDecomposition: Object.freeze({ ...value.squareFreeDecomposition,
      factors: Object.freeze(value.squareFreeDecomposition.factors.map((part) => Object.freeze({ ...part }))) }),
    factorization: Object.freeze({ ...value.factorization,
      factors: Object.freeze(value.factorization.factors.map((part) => Object.freeze({ ...part }))) }),
    rationalRoots: Object.freeze(value.rationalRoots.map((root) => Object.freeze({ ...root }))),
  }) as PolynomialDossierResult;
};
