import { defaultVectorField3DWorkspace, reviseVectorField3DDocument,
  reviseVectorField3DWorkspace, type VectorField3DDocument,
  type VectorField3DSeedGroupStyle, type VectorField3DSource } from "@math3d/core";
import { Color } from "three";

export type SeedEditSnapshot = Readonly<{
  seeds: VectorField3DSource["seeds"];
  hiddenSeedGroups: readonly string[];
  seedGroupStyles: readonly VectorField3DSeedGroupStyle[];
}>;

const palette = ["#fbbf24", "#38bdf8", "#a78bfa", "#34d399", "#fb7185",
  "#f97316", "#2dd4bf", "#e879f9"] as const;

export function defaultSeedGroupColor(id: string): string {
  if (id === "manual") return palette[0];
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return palette[1 + ((hash >>> 0) % (palette.length - 1))]!;
}

export function seedGroupStyle(document: VectorField3DDocument, id: string):
  Readonly<{ name: string; color: string }> {
  const saved = document.workspace?.seedGroupStyles.find(style => style.id === id);
  return { name: saved?.name ?? (id === "manual" ? "Manual" : id),
    color: saved?.color ?? defaultSeedGroupColor(id) };
}

export function seedGroupColorRgb(color: string): readonly [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new TypeError("Invalid seed group color.");
  const linear = new Color(color);
  return [linear.r, linear.g, linear.b];
}

export function captureSeedEdit(document: VectorField3DDocument): SeedEditSnapshot {
  const view = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  return { seeds: document.source.seeds, hiddenSeedGroups: view.hiddenSeedGroups,
    seedGroupStyles: view.seedGroupStyles };
}

export function restoreSeedEdit(document: VectorField3DDocument,
  snapshot: SeedEditSnapshot): VectorField3DDocument {
  const changedSeeds = JSON.stringify(document.source.seeds) !== JSON.stringify(snapshot.seeds);
  const active = new Set(snapshot.seeds.map(seed => seed.group ?? "manual"));
  const currentView = document.workspace ?? defaultVectorField3DWorkspace(document.source);
  const prepared = changedSeeds ? reviseVectorField3DWorkspace(document, { ...currentView,
    hiddenSeedGroups: currentView.hiddenSeedGroups.filter(id => active.has(id)),
    seedGroupStyles: currentView.seedGroupStyles.filter(style => active.has(style.id)) }) : document;
  const next = changedSeeds ? reviseVectorField3DDocument(prepared,
    { ...document.source, seeds: snapshot.seeds }) : prepared;
  const view = next.workspace ?? defaultVectorField3DWorkspace(next.source);
  return reviseVectorField3DWorkspace(next, { ...view,
    hiddenSeedGroups: snapshot.hiddenSeedGroups,
    seedGroupStyles: snapshot.seedGroupStyles });
}
