import { SURFACE_COMMAND_TYPES, createSurfaceDocument, evaluateGraph2DExpression, parseGraph2DExpression, type SurfaceDocument, type SurfaceDocumentSource } from "@math3d/core";
import { SurfaceCommandAdapter, type SurfaceReplayBundle } from "@math3d/kernel";

export type MobileSurfaceDomain = { kind: string; u: { min: number; max: number; periodic?: boolean }; v: { min: number; max: number; periodic?: boolean } };
export const mobileSurfaceDomain = (source: SurfaceDocumentSource): MobileSurfaceDomain => {
  const domain = source.domain as unknown as MobileSurfaceDomain;
  if (domain?.kind !== "parameter" || !domain.u || !domain.v || domain.u.periodic || domain.v.periodic ||
      ![domain.u.min, domain.u.max, domain.v.min, domain.v.max].every(Number.isFinite) || domain.u.min >= domain.u.max || domain.v.min >= domain.v.max)
    throw new TypeError("Mobile Surface editing requires finite, increasing nonperiodic u/v domains.");
  return domain;
};
/** Fixed 17×17 grid; mathematical expressions are parsed without dynamic code. */
export const sampleMobileSurface = (source: SurfaceDocumentSource): readonly (readonly number[])[] => {
  if (source.representation !== "parametric" || source.definition.sourceIds?.length || source.definition.meshId || source.branchPolicy !== null)
    throw new TypeError("Mobile Surface editing supports independent literal parametric sources.");
  const domain = mobileSurfaceDomain(source), expressions = source.definition.expressions ?? {};
  const asts = [expressions.x, expressions.y, expressions.z].map(expression => {
    if (!expression || expression.length > 4096) throw new TypeError("Complete Surface expressions of at most 4096 characters are required.");
    const parsed = parseGraph2DExpression(expression, ["u", "v"]);
    if (!parsed.ok) throw new TypeError("Invalid Surface expression.");
    return parsed.ast;
  });
  return Array.from({ length: 289 }, (_, index) => {
    const u = domain.u.min + (domain.u.max - domain.u.min) * (index % 17) / 16;
    const v = domain.v.min + (domain.v.max - domain.v.min) * Math.floor(index / 17) / 16;
    return asts.map(ast => {
      const evaluated = evaluateGraph2DExpression(ast, { u, v });
      if (!evaluated.ok || !Number.isFinite(evaluated.value)) throw new TypeError("Surface expression is undefined in the saved domain.");
      return evaluated.value;
    });
  });
};
export const mobileSurfaceUnavailableReason = (document: SurfaceDocument, replay?: SurfaceReplayBundle): string | null => {
  try {
    sampleMobileSurface(document.source);
    if (replay) {
      replay = SurfaceCommandAdapter.fromReplayBundle(replay).replayBundle();
      sampleMobileSurface(replay.checkpoint.source);
      for (const transaction of replay.transactions) for (const command of [transaction.forward, transaction.inverse])
        if (command.command.type === SURFACE_COMMAND_TYPES.replaceSource) sampleMobileSurface(command.command.payload as SurfaceDocumentSource);
    }
    return null;
  } catch (error) { return (error as Error).message; }
};
export const commitMobileSurfaceSource = (adapter: SurfaceCommandAdapter, source: SurfaceDocumentSource): SurfaceDocument => {
  createSurfaceDocument({ source }); sampleMobileSurface(source);
  return adapter.commitSource(source);
};
