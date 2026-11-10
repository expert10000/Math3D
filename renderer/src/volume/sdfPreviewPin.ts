import type { VolumeDataset, VolumeGrid } from "../scene/datasets";
import type { VolumeSdfOperation } from "./contracts";

export type SdfPreviewSettings = Readonly<{
  operation: VolumeSdfOperation;
  amount: number;
  smoothness: number;
  presetId: string;
}>;
export type SdfPreviewPin = Readonly<{
  sourceId: string | null;
  sourceGrid: string;
  sourceSign: string;
  operandGrid: string | null;
  settings: SdfPreviewSettings;
}>;

export const sdfNeedsOperand = (operation: VolumeSdfOperation): boolean =>
  operation === "union" || operation === "intersection" || operation === "subtraction" || operation === "smooth-union";

export const fingerprintSdfGrid = (grid: VolumeGrid): string => {
  const bytes = new Uint8Array(grid.scalars.buffer, grid.scalars.byteOffset, grid.scalars.byteLength);
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return JSON.stringify({
    dims: grid.dims, origin: grid.origin ?? [0, 0, 0], spacing: grid.spacing ?? [1, 1, 1],
    direction: grid.direction ?? [1, 0, 0, 0, 1, 0, 0, 0, 1], centering: grid.centering ?? "point",
    length: grid.scalars.length, hash: (hash >>> 0).toString(36),
  });
};

export const createSdfPreviewPin = (
  source: VolumeDataset,
  operand: VolumeGrid | null,
  settings: SdfPreviewSettings,
): SdfPreviewPin => ({
  sourceId: source.sourceId ?? null,
  sourceGrid: fingerprintSdfGrid(source.grid),
  sourceSign: JSON.stringify(source.sdf?.sign ?? null),
  operandGrid: sdfNeedsOperand(settings.operation) && operand ? fingerprintSdfGrid(operand) : null,
  settings: { ...settings },
});

export const qualifySdfPreview = (
  pin: SdfPreviewPin | null,
  source: VolumeDataset | null,
  operand: VolumeGrid | null,
  settings: SdfPreviewSettings,
): { current: boolean; reason: string } => {
  if (!pin || !source) return { current: false, reason: "SDF preview or source is unavailable." };
  if (JSON.stringify(pin.settings) !== JSON.stringify(settings)) return { current: false, reason: "SDF operation settings changed." };
  if (pin.sourceId !== (source.sourceId ?? null) || pin.sourceGrid !== fingerprintSdfGrid(source.grid) ||
      pin.sourceSign !== JSON.stringify(source.sdf?.sign ?? null))
    return { current: false, reason: "SDF source grid or sign evidence changed." };
  const currentOperand = sdfNeedsOperand(settings.operation) && operand ? fingerprintSdfGrid(operand) : null;
  if (pin.operandGrid !== currentOperand) return { current: false, reason: "SDF secondary operand changed." };
  return { current: true, reason: "Preview matches the source grids and operation settings." };
};
