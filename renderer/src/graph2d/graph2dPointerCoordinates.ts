export type Graph2DPointer = Readonly<{ clientX: number; clientY: number }>;
export const graph2DLocalPointer = (
  pointer: Graph2DPointer,
  size: Readonly<{ width: number; height: number }>,
  rect: Readonly<{ left: number; top: number; width: number; height: number }>,
): { x: number; y: number } | null => {
  if (![pointer.clientX, pointer.clientY, size.width, size.height, rect.left, rect.top, rect.width, rect.height]
      .every(Number.isFinite) || size.width <= 0 || size.height <= 0 || rect.width <= 0 || rect.height <= 0) return null;
  const x = (pointer.clientX - rect.left) * size.width / rect.width;
  const y = (pointer.clientY - rect.top) * size.height / rect.height;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};
