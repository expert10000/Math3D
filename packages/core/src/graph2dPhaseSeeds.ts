import type { Graph2DDocument, Graph2DPhasePortraitObject } from "./graph2dDocument";
import type { Graph2DAuthoringAction } from "./graph2dAuthoring";
import { structuralHash } from "./documentIdentity";
import { graph2DScreenToWorld, graph2DHasLogScale, type Graph2DScreenPoint,
  type Graph2DScreenSize, type Graph2DViewport } from "./graph2dViewport";

type Point = Readonly<{ x: number; y: number }>;

const phase = (document: Graph2DDocument, objectId: string): Graph2DPhasePortraitObject => {
  const object = document.source.objects.find(item => item.id === objectId);
  if (object?.kind !== "phase-portrait") throw new TypeError("Select a phase portrait first.");
  return object;
};

/** A placement must be inside the authored domain; dragging stays on its boundary. */
export const graph2DPhaseSeedAtScreen = (document: Graph2DDocument, objectId: string,
  viewport: Graph2DViewport, size: Graph2DScreenSize, screen: Graph2DScreenPoint,
  mode: "place" | "drag"): Point | null => {
  const object = phase(document, objectId);
  if (graph2DHasLogScale(viewport) || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
  const world = graph2DScreenToWorld(viewport, size, screen);
  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return null;
  if (mode === "place" && (world.x < object.domain.min || world.x > object.domain.max ||
      world.y < object.yDomain.min || world.y > object.yDomain.max)) return null;
  return { x: Math.min(object.domain.max, Math.max(object.domain.min, world.x)),
    y: Math.min(object.yDomain.max, Math.max(object.yDomain.min, world.y)) };
};

const editedSeeds = (object: Graph2DPhasePortraitObject, index: number | null, point: Point): readonly Point[] => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < object.domain.min || point.x > object.domain.max ||
      point.y < object.yDomain.min || point.y > object.yDomain.max)
    throw new TypeError("Initial point must be finite and inside the phase domain.");
  if (index === null) {
    if (object.seeds.length >= 8) throw new TypeError("A phase portrait supports at most eight initial points.");
    return [...object.seeds, point];
  }
  if (!Number.isInteger(index) || index < 0 || index >= object.seeds.length) throw new TypeError("Initial point is unavailable.");
  return object.seeds.map((seed, offset) => offset === index ? point : seed);
};

/** The host commits this one authoring action on release, yielding one undo step. */
const seedListAction = (document: Graph2DDocument, objectId: string,
  seeds: readonly Point[]): Graph2DAuthoringAction => {
  const object = phase(document, objectId);
  const style = document.display.objects.find(item => item.objectId === objectId);
  if (!style) throw new TypeError("Phase portrait display is unavailable.");
  return { type: "edit-phase-portrait", objectId, draft: { label: object.label,
    xDerivative: object.xDerivative.source, yDerivative: object.yDerivative.source,
    domain: object.domain, yDomain: object.yDomain, timeSpan: object.timeSpan,
    seeds,
    style: { color: style.color, lineWidth: style.lineWidth, lineStyle: style.lineStyle, visible: style.visible } } };
};

export const graph2DPhaseSeedAction = (document: Graph2DDocument, objectId: string,
  index: number | null, point: Point): Graph2DAuthoringAction =>
  seedListAction(document, objectId, editedSeeds(phase(document, objectId), index, point));

/** Remove one seed, or every seed when index is null. The host commits one undoable edit. */
export const graph2DPhaseSeedRemovalAction = (document: Graph2DDocument, objectId: string,
  index: number | null): Graph2DAuthoringAction => {
  const object = phase(document, objectId);
  if (index === null) return seedListAction(document, objectId, []);
  if (!Number.isInteger(index) || index < 0 || index >= object.seeds.length)
    throw new TypeError("Initial point is unavailable.");
  return seedListAction(document, objectId, object.seeds.filter((_, offset) => offset !== index));
};

/** Ephemeral source for live orbit sampling. Revision/history change only after release. */
export const previewGraph2DPhaseSeed = (document: Graph2DDocument, objectId: string,
  index: number, point: Point): Graph2DDocument => {
  const object = phase(document, objectId);
  const updated = { ...object, seeds: editedSeeds(object, index, point) };
  const source = { ...document.source, objects: document.source.objects.map(item => item.id === objectId ? updated : item) };
  return { ...document, source, identity: { ...document.identity, structuralHash: structuralHash(source) } };
};
