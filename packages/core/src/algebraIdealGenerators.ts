/** Conservative syntax gate for bounded exact QQ polynomial ideal generators. */
export const parseIdealGenerator = (input: unknown, variables?: readonly string[]): string => {
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
  const atom = (): number => {
    const token = tokens[at++];
    if (token === "(") {
      const degree = sum();
      if (tokens[at++] !== ")") throw new TypeError("Ideal generator has unmatched parentheses.");
      return degree;
    }
    if (token && /^[A-Za-z]/.test(token)) {
      if (variables && !variables.includes(token))
        throw new TypeError(`Ideal generator variable ${token} is outside the ambient ring.`);
      return 1;
    }
    if (token && /^(?:0|[1-9][0-9]{0,17})(?:\/[1-9][0-9]{0,17})?$/.test(token)) return 0;
    throw new TypeError("Ideal generator is not a polynomial expression.");
  };
  const power = (): number => {
    if (tokens[at] === "+" || tokens[at] === "-") at += 1;
    let degree = atom();
    if (tokens[at] === "^") {
      at += 1;
      const exponent = tokens[at++];
      if (!exponent || !/^(?:0|[1-9][0-9]?)$/.test(exponent) || Number(exponent) > 16)
        throw new TypeError("Ideal generator exponent must be an integer from 0 to 16.");
      degree *= Number(exponent);
    }
    if (degree > 16) throw new TypeError("Ideal generator total degree exceeds 16.");
    return degree;
  };
  const product = (): number => {
    let degree = power();
    while (tokens[at] === "*" || tokens[at] === "/") {
      if (tokens[at] === "/") {
        at += 1;
        const denominator = tokens[at++];
        if (!denominator || !/^[1-9][0-9]{0,17}$/.test(denominator))
          throw new TypeError("Ideal generator division requires a nonzero integer denominator.");
        continue;
      }
      at += 1;
      degree += power();
      if (degree > 16) throw new TypeError("Ideal generator total degree exceeds 16.");
    }
    return degree;
  };
  const sum = (): number => {
    let degree = product();
    while (tokens[at] === "+" || tokens[at] === "-") { at += 1; degree = Math.max(degree, product()); }
    return degree;
  };
  sum();
  if (at !== tokens.length) throw new TypeError("Ideal generator is not a complete polynomial expression.");
  return expression;
};
