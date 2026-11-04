/** Exact, bounded quadratic fields over QQ. General number fields are a later gate. */
export type QuadraticNumberFieldFacts = Readonly<{
  coefficients: readonly [string, string, "1"];
  generator: string;
  definingPolynomial: string;
  polynomialDiscriminant: string;
  squarefreeRadicand: string;
  fieldDiscriminant: string;
  signature: readonly [number, number];
  powerBasis: readonly ["1", string];
  integralBasis: readonly ["1", string];
  ringOfIntegers: string;
  embeddingImages: readonly [string, string];
}>;

const coefficient = (value: unknown, index: number): bigint => {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,3})$/.test(value) ||
      BigInt(value) < -4096n || BigInt(value) > 4096n)
    throw new TypeError(`Number field coefficient ${index} must be a canonical integer from -4096 to 4096.`);
  return BigInt(value);
};

const squareRootFloor = (n: bigint): bigint => {
  let low = 0n, high = 4100n;
  while (low + 1n < high) {
    const mid = (low + high) / 2n;
    if (mid * mid <= n) low = mid;
    else high = mid;
  }
  return low;
};

/** Checks monic irreducibility using the exact quadratic discriminant criterion. */
export const analyzeQuadraticNumberField = (input: unknown, generator: unknown): QuadraticNumberFieldFacts => {
  if (!Array.isArray(input) || input.length !== 3 || input[2] !== "1")
    throw new TypeError("D01 number fields require monic quadratic coefficients [constant, linear, 1].");
  const c = coefficient(input[0], 0), b = coefficient(input[1], 1);
  if (typeof generator !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(generator))
    throw new TypeError("Number field generator must be an ASCII identifier of at most 32 characters.");
  const discriminant = b * b - 4n * c;
  if (discriminant >= 0n && squareRootFloor(discriminant) ** 2n === discriminant)
    throw new TypeError("Defining quadratic is reducible over QQ: its discriminant is a square.");
  let remaining = discriminant < 0n ? -discriminant : discriminant;
  let radicand = discriminant < 0n ? -1n : 1n, squareFactor = 1n;
  for (let factor = 2n; factor * factor <= remaining; factor += 1n) {
    let exponent = 0;
    while (remaining % factor === 0n) { remaining /= factor; exponent += 1; }
    if (exponent % 2) radicand *= factor;
    squareFactor *= factor ** BigInt(Math.floor(exponent / 2));
  }
  if (remaining > 1n) radicand *= remaining;
  const oneModFour = ((radicand % 4n) + 4n) % 4n === 1n;
  const fieldDiscriminant = oneModFour ? radicand : 4n * radicand;
  const root = `√${radicand < 0n ? `(${radicand})` : radicand}`;
  const simpleRoot = b === 0n && squareFactor === 2n;
  const images: readonly [string, string] = simpleRoot ? [root, `-${root}`] :
    [`(${-b} + ${squareFactor}${root})/2`, `(${-b} - ${squareFactor}${root})/2`];
  const integralGenerator = oneModFour ? `(1+${simpleRoot ? generator : root})/2` :
    simpleRoot ? generator : root;
  const polynomial = `x^2${b === 0n ? "" : b < 0n ? ` - ${-b}*x` : ` + ${b}*x`}` +
    `${c === 0n ? "" : c < 0n ? ` - ${-c}` : ` + ${c}`}`;
  return Object.freeze({ coefficients: [c.toString(), b.toString(), "1"] as const, generator,
    definingPolynomial: polynomial, polynomialDiscriminant: discriminant.toString(),
    squarefreeRadicand: radicand.toString(), fieldDiscriminant: fieldDiscriminant.toString(),
    signature: discriminant > 0n ? [2, 0] as const : [0, 1] as const,
    powerBasis: ["1", generator] as const, integralBasis: ["1", integralGenerator] as const,
    ringOfIntegers: oneModFour ? `Z[(1+${root})/2]` : `Z[${root}]`,
    embeddingImages: images });
};
