import type {
  AnalysisDomain,
  AnalysisIdentity,
  AnalysisResultDependency,
  AnalysisResultStore,
} from "./contracts";
import { analysisResultKey, getAnalysisResult } from "./resultStore";

export type AnalysisDependencyDefinition<TKind extends string = string> = { kind: TKind; variant?: string };

export type AnalysisDefinition<TKind extends string = string, TDomain extends string = AnalysisDomain> = {
  kind: TKind;
  variant?: string;
  label: string;
  family: string;
  domain: TDomain;
  dependencies?: readonly AnalysisDependencyDefinition<TKind>[];
};

export type AnalysisRegistry<TKind extends string = string, TDomain extends string = AnalysisDomain> =
  ReadonlyMap<string, AnalysisDefinition<TKind, TDomain>>;

export const analysisRegistryKey = (kind: string, variant = "default"): string => `${kind}:${variant}`;

export const createAnalysisRegistry = <TKind extends string, TDomain extends string = AnalysisDomain>(
  definitions: readonly AnalysisDefinition<TKind, TDomain>[],
  subjectLabel = "Analysis"
): AnalysisRegistry<TKind, TDomain> => {
  const registry = new Map<string, AnalysisDefinition<TKind, TDomain>>();
  for (const definition of definitions) {
    const key = analysisRegistryKey(definition.kind, definition.variant);
    if (registry.has(key)) throw new Error(`${subjectLabel} ${key} is already registered.`);
    registry.set(key, { ...definition, dependencies: [...(definition.dependencies ?? [])] });
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new Error(`${subjectLabel} dependency cycle includes ${key}.`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of registry.get(key)?.dependencies ?? []) {
      const dependencyKey = analysisRegistryKey(dependency.kind, dependency.variant);
      if (!registry.has(dependencyKey)) {
        throw new Error(`${subjectLabel} ${key} depends on unregistered analysis ${dependencyKey}.`);
      }
      visit(dependencyKey);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of registry.keys()) visit(key);
  return registry;
};

export const registerAnalysis = <TKind extends string, TDomain extends string = AnalysisDomain>(
  registry: AnalysisRegistry<TKind, TDomain>,
  definition: AnalysisDefinition<TKind, TDomain>,
  subjectLabel = "Analysis"
): AnalysisRegistry<TKind, TDomain> => createAnalysisRegistry([...registry.values(), definition], subjectLabel);

export const getAnalysisDefinition = <TKind extends string, TDomain extends string = AnalysisDomain>(
  registry: AnalysisRegistry<TKind, TDomain>,
  kind: TKind,
  variant = "default"
): AnalysisDefinition<TKind, TDomain> | null => registry.get(analysisRegistryKey(kind, variant)) ?? null;

export const listAnalysisDefinitions = <TKind extends string, TDomain extends string = AnalysisDomain>(
  registry: AnalysisRegistry<TKind, TDomain>
): AnalysisDefinition<TKind, TDomain>[] => [...registry.values()];

export const resolveAnalysisDependencies = <
  TKind extends string,
  TIdentity extends AnalysisIdentity,
  TDomain extends string = AnalysisDomain,
>(
  registry: AnalysisRegistry<TKind, TDomain>,
  store: AnalysisResultStore<TKind, TIdentity>,
  identity: TIdentity,
  kind: TKind,
  variant = "default"
): AnalysisResultDependency<TKind>[] => {
  const definition = getAnalysisDefinition(registry, kind, variant);
  if (!definition) throw new Error(`Analysis ${analysisRegistryKey(kind, variant)} is not registered.`);
  return (definition.dependencies ?? []).map((dependency) => {
    const dependencyVariant = dependency.variant ?? "default";
    const result = getAnalysisResult(store, identity, dependency.kind, dependencyVariant);
    return {
      kind: dependency.kind,
      variant: dependencyVariant,
      key: analysisResultKey(identity, dependency.kind, dependencyVariant),
      state: result?.state ?? "stale",
      resultVersion: result?.resultVersion,
    };
  });
};
