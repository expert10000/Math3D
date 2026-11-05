/** Bounded finite groups with exact, portable generators. No GAP call is needed to validate E01 records. */
export type GroupWordTerm = Readonly<{ generator: string; exponent: number }>;
export type GroupRelation = Readonly<{ label: string; word: readonly GroupWordTerm[] }>;
export type FiniteGroupDefinition =
  | Readonly<{ kind: "finite-group"; representation: "permutation"; degree: number;
      generators: readonly Readonly<{ name: string; images: readonly number[] }>[];
      relations: readonly GroupRelation[] }>
  | Readonly<{ kind: "finite-group"; representation: "abelian"; invariantFactors: readonly number[];
      generators: readonly string[] }>;
export type FiniteGroupFacts = Readonly<{ order: number; representation: "permutation" | "abelian";
  generatorOrders: readonly Readonly<{ name: string; order: number }>[];
  presentation: string; checkedRelations: readonly string[]; elementCount: number; involutionCount: number }>;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const name = (value: unknown): value is string => typeof value === "string" &&
  /^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(value);
const perm = (value: unknown, degree: number): value is number[] => Array.isArray(value) &&
  value.length === degree && value.every((item) => Number.isSafeInteger(item) && item >= 1 && item <= degree) &&
  new Set(value).size === degree;
const compose = (a: readonly number[], b: readonly number[]) => b.map((item) => a[item - 1]);
const key = (a: readonly number[]) => a.join(",");
const identity = (degree: number) => Array.from({ length: degree }, (_, index) => index + 1);
const inverse = (a: readonly number[]) => a.map((_, index) => a.indexOf(index + 1) + 1);
const power = (a: readonly number[], exponent: number): number[] => {
  let result = identity(a.length), base = exponent < 0 ? inverse(a) : [...a];
  for (let i = 0; i < Math.abs(exponent); i += 1) result = compose(result, base);
  return result;
};
const orderOf = (a: readonly number[]): number => {
  let result = identity(a.length);
  for (let i = 1; i <= 64; i += 1) {
    result = compose(result, a);
    if (key(result) === key(identity(a.length))) return i;
  }
  throw new TypeError("Permutation generator order exceeds 64.");
};

export const parseFiniteGroupDefinition = (value: unknown): FiniteGroupDefinition => {
  if (!object(value) || value.kind !== "finite-group") throw new TypeError("Finite group definition is invalid.");
  if (value.representation === "abelian") {
    if (!exact(value, ["kind", "representation", "invariantFactors", "generators"]) ||
        !Array.isArray(value.invariantFactors) || value.invariantFactors.length < 1 ||
        value.invariantFactors.length > 4 || !value.invariantFactors.every((item) =>
          Number.isSafeInteger(item) && item >= 2 && item <= 64) ||
        !value.invariantFactors.every((item, index) => index === 0 || item % (value.invariantFactors as number[])[index - 1] === 0) ||
        value.invariantFactors.reduce((product: number, item: number) => product * item, 1) > 256 ||
        !Array.isArray(value.generators) || value.generators.length !== value.invariantFactors.length ||
        !value.generators.every(name) || new Set(value.generators).size !== value.generators.length)
      throw new TypeError("Finite abelian group requires invariant factors in a divisibility chain, order at most 256, and distinct generators.");
    return { kind: "finite-group", representation: "abelian",
      invariantFactors: [...value.invariantFactors], generators: [...value.generators] };
  }
  if (value.representation !== "permutation" || !exact(value, ["kind", "representation", "degree", "generators", "relations"]) ||
      !Number.isSafeInteger(value.degree) || (value.degree as number) < 2 || (value.degree as number) > 8 ||
      !Array.isArray(value.generators) || value.generators.length < 1 || value.generators.length > 3 ||
      !value.generators.every((item) => object(item) && exact(item, ["name", "images"]) &&
        name(item.name) && perm(item.images, value.degree as number)) ||
      new Set(value.generators.map((item: { name: string }) => item.name)).size !== value.generators.length ||
      !Array.isArray(value.relations) || value.relations.length > 8)
    throw new TypeError("Permutation group requires degree 2–8 and one to three named exact generators.");
  const generators = value.generators as { name: string; images: number[] }[];
  const byName = new Map(generators.map((item) => [item.name, item.images]));
  const relations = value.relations as unknown[];
  for (const relation of relations) {
    if (!object(relation) || !exact(relation, ["label", "word"]) ||
        typeof relation.label !== "string" || !relation.label.trim() || relation.label.length > 80 ||
        !Array.isArray(relation.word) || relation.word.length < 1 || relation.word.length > 16 ||
        !relation.word.every((term) => object(term) && exact(term, ["generator", "exponent"]) &&
          byName.has(String(term.generator)) && Number.isSafeInteger(term.exponent) &&
          term.exponent !== 0 && Math.abs(term.exponent as number) <= 8))
      throw new TypeError("Finite group relation must be a bounded word in its named generators.");
    let product = identity(value.degree as number);
    for (const term of relation.word as GroupWordTerm[])
      product = compose(product, power(byName.get(term.generator)!, term.exponent));
    if (key(product) !== key(identity(value.degree as number)))
      throw new TypeError(`Finite group relation '${relation.label}' is false for these permutations.`);
  }
  if (new Set(relations.map((item) => (item as GroupRelation).label)).size !== relations.length)
    throw new TypeError("Finite group relation labels must be distinct.");
  const parsed: FiniteGroupDefinition = { kind: "finite-group", representation: "permutation",
    degree: value.degree as number, generators: generators.map((item) => ({ name: item.name, images: [...item.images] })),
    relations: relations.map((item) => ({ label: (item as GroupRelation).label,
      word: (item as GroupRelation).word.map((term) => ({ ...term })) })) };
  analyzeFiniteGroup(parsed);
  return parsed;
};

export const analyzeFiniteGroup = (definition: FiniteGroupDefinition): FiniteGroupFacts => {
  if (definition.representation === "abelian") {
    const order = definition.invariantFactors.reduce((product, item) => product * item, 1);
    return { order, representation: "abelian",
      generatorOrders: definition.generators.map((generator, index) => ({ name: generator,
        order: definition.invariantFactors[index] })),
      presentation: definition.invariantFactors.map((factor) => `C${factor}`).join(" × "),
      checkedRelations: definition.generators.map((generator, index) => `${generator}^${definition.invariantFactors[index]} = e`),
      elementCount: order,
      involutionCount: 2 ** definition.invariantFactors.filter((factor) => factor % 2 === 0).length - 1 };
  }
  const elements = new Map<string, number[]>(), one = identity(definition.degree);
  elements.set(key(one), one);
  const queue = [one];
  while (queue.length) {
    const current = queue.shift()!;
    for (const generator of definition.generators) {
      const next = compose(current, generator.images), signature = key(next);
      if (elements.has(signature)) continue;
      if (elements.size >= 64) throw new TypeError("Permutation group order exceeds the E01 limit of 64.");
      elements.set(signature, next);
      queue.push(next);
    }
  }
  return { order: elements.size, representation: "permutation",
    generatorOrders: definition.generators.map((generator) => ({ name: generator.name, order: orderOf(generator.images) })),
    presentation: `⟨${definition.generators.map((item) => item.name).join(", ")}⟩ ≤ S${definition.degree}`,
    checkedRelations: definition.relations.map((item) => item.label), elementCount: elements.size,
    involutionCount: [...elements.values()].filter((element) => orderOf(element) === 2).length };
};

export const FINITE_GROUP_PRESETS: readonly Readonly<{ id: "C4" | "V4" | "S3" | "D4" | "Q8";
  definition: FiniteGroupDefinition; description: string }>[] = Object.freeze([
  { id: "C4", description: "Cyclic group of order 4", definition: { kind: "finite-group", representation: "abelian",
    invariantFactors: [4], generators: ["a"] } },
  { id: "V4", description: "Klein four group C2 × C2", definition: { kind: "finite-group", representation: "abelian",
    invariantFactors: [2, 2], generators: ["a", "b"] } },
  { id: "S3", description: "Symmetric group on three points", definition: { kind: "finite-group", representation: "permutation",
    degree: 3, generators: [{ name: "r", images: [2, 3, 1] }, { name: "s", images: [2, 1, 3] }],
    relations: [{ label: "r³ = e", word: [{ generator: "r", exponent: 3 }] },
      { label: "s² = e", word: [{ generator: "s", exponent: 2 }] },
      { label: "(sr)² = e", word: [{ generator: "s", exponent: 1 }, { generator: "r", exponent: 1 },
        { generator: "s", exponent: 1 }, { generator: "r", exponent: 1 }] }] } },
  { id: "D4", description: "Square symmetries, order 8", definition: { kind: "finite-group", representation: "permutation",
    degree: 4, generators: [{ name: "r", images: [2, 3, 4, 1] }, { name: "s", images: [1, 4, 3, 2] }],
    relations: [{ label: "r⁴ = e", word: [{ generator: "r", exponent: 4 }] },
      { label: "s² = e", word: [{ generator: "s", exponent: 2 }] },
      { label: "(sr)² = e", word: [{ generator: "s", exponent: 1 }, { generator: "r", exponent: 1 },
        { generator: "s", exponent: 1 }, { generator: "r", exponent: 1 }] }] } },
  { id: "Q8", description: "Quaternion group, regular action on eight points", definition: {
    kind: "finite-group", representation: "permutation", degree: 8,
    generators: [{ name: "i", images: [3, 4, 2, 1, 7, 8, 6, 5] },
      { name: "j", images: [5, 6, 8, 7, 2, 1, 3, 4] }],
    relations: [{ label: "i⁴ = e", word: [{ generator: "i", exponent: 4 }] },
      { label: "j⁴ = e", word: [{ generator: "j", exponent: 4 }] },
      { label: "i² = j²", word: [{ generator: "i", exponent: 2 }, { generator: "j", exponent: -2 }] }] } },
]);
