import { parseIdealGenerator } from "./algebraIdealGenerators";

/** A conservative proof for the standard grading; unsupported syntax stays unavailable. */
export const isProvablyHomogeneousIdeal = (generators: readonly string[], variables: readonly string[]): boolean =>
  generators.length > 0 && generators.every((input) => {
    let source: string;
    try { source = parseIdealGenerator(input, variables); } catch { return false; }
    if (/[()]/.test(source)) return false;
    const terms = source.replace(/-/g, "+-").split("+").filter(Boolean);
    if (!terms.length) return false;
    const degrees = new Set<number>();
    for (const term of terms) {
      const factors = term.replace(/^-/, "").split("*");
      if (!factors.length) return false;
      let degree = 0;
      for (const factor of factors) {
        if (/^(?:0|[1-9][0-9]{0,17})(?:\/[1-9][0-9]{0,17})?$/.test(factor)) continue;
        const variable = /^([A-Za-z][A-Za-z0-9_]*)(?:\^(0|[1-9][0-9]?))?(?:\/[1-9][0-9]{0,17})?$/.exec(factor);
        if (!variable || !variables.includes(variable[1])) return false;
        degree += variable[2] === undefined ? 1 : Number(variable[2]);
      }
      if (degree > 16) return false;
      if (term.replace(/^-/, "") !== "0") degrees.add(degree);
    }
    return degrees.size <= 1;
  });
