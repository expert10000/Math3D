export type IdealGeneratorMetrics = Readonly<{ expression: string; degreeUpperBound: number; termUpperBound: number }>;
type Metrics = { degree: number; terms: number };
const capped = (value: number) => Math.min(value, 129);

/** Conservative syntax and expansion bounds for exact QQ polynomial ideal generators. */
export const analyzeIdealGenerator = (input: unknown, variables?: readonly string[]): IdealGeneratorMetrics => {
  if (typeof input !== "string" || input.length > 256 || !input.trim())
    throw new TypeError("Ideal generator must contain 1 to 256 characters.");
  const expression = input.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_()+*^\/-]+$/.test(expression))
    throw new TypeError("Ideal generator contains unsupported syntax.");
  if (/(?:\+\+|--|\+-|-\+)/.test(expression))
    throw new TypeError("Ideal generator contains consecutive signs.");
  const tokens = expression.match(/[A-Za-z][A-Za-z0-9_]*|(?:0|[1-9][0-9]{0,17})(?:\/(?:[1-9][0-9]{0,17}))?|[()+*^/-]/g);
  if (!tokens || tokens.length > 128 || tokens.join("") !== expression)
    throw new TypeError("Ideal generator has noncanonical numbers or too many tokens.");
  let at = 0;
  const atom = (): Metrics => {
    const token = tokens[at++];
    if (token === "(") {
      const metrics = sum();
      if (tokens[at++] !== ")") throw new TypeError("Ideal generator has unmatched parentheses.");
      return metrics;
    }
    if (token && /^[A-Za-z]/.test(token)) {
      if (variables && !variables.includes(token))
        throw new TypeError(`Ideal generator variable ${token} is outside the ambient ring.`);
      return { degree: 1, terms: 1 };
    }
    if (token && /^(?:0|[1-9][0-9]{0,17})(?:\/[1-9][0-9]{0,17})?$/.test(token))
      return { degree: 0, terms: 1 };
    throw new TypeError("Ideal generator is not a polynomial expression.");
  };
  const power = (): Metrics => {
    if (tokens[at] === "+" || tokens[at] === "-") at += 1;
    const metrics = atom();
    if (tokens[at] === "^") {
      at += 1;
      const exponent = tokens[at++];
      if (!exponent || !/^(?:0|[1-9][0-9]?)$/.test(exponent) || Number(exponent) > 16)
        throw new TypeError("Ideal generator exponent must be an integer from 0 to 16.");
      metrics.degree *= Number(exponent);
      metrics.terms = capped(metrics.terms ** Number(exponent));
    }
    if (metrics.degree > 16) throw new TypeError("Ideal generator total degree exceeds 16.");
    return metrics;
  };
  const product = (): Metrics => {
    const metrics = power();
    while (tokens[at] === "*" || tokens[at] === "/") {
      if (tokens[at] === "/") {
        at += 1;
        const denominator = tokens[at++];
        if (!denominator || !/^[1-9][0-9]{0,17}$/.test(denominator))
          throw new TypeError("Ideal generator division requires a nonzero integer denominator.");
        continue;
      }
      at += 1;
      const factor = power();
      metrics.degree += factor.degree;
      metrics.terms = capped(metrics.terms * factor.terms);
      if (metrics.degree > 16) throw new TypeError("Ideal generator total degree exceeds 16.");
    }
    return metrics;
  };
  const sum = (): Metrics => {
    const metrics = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      at += 1;
      const next = product();
      metrics.degree = Math.max(metrics.degree, next.degree);
      metrics.terms = capped(metrics.terms + next.terms);
    }
    return metrics;
  };
  const metrics = sum();
  if (at !== tokens.length) throw new TypeError("Ideal generator is not a complete polynomial expression.");
  return { expression, degreeUpperBound: metrics.degree, termUpperBound: metrics.terms };
};

/** Conservative syntax gate for bounded exact QQ polynomial ideal generators. */
export const parseIdealGenerator = (input: unknown, variables?: readonly string[]): string =>
  analyzeIdealGenerator(input, variables).expression;
