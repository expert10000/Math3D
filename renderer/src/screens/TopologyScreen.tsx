import React, { useEffect, useMemo, useRef, useState } from "react";
import { uiStyles as styles } from "../uiStyles";
import {
  addEdgeToDiagram,
  addVertexToDiagram,
  buildPlannedOperations,
  buildPlannedSteps,
  createDefaultAnimationPlan,
  DEFAULT_TOPOLOGY_PRESET_ID,
  TOPOLOGY_PRESET_BY_ID,
  TOPOLOGY_DOCUMENT_EXTENSION,
  TOPOLOGY_PRESETS,
  TopologyRealization3DView,
  buildQuotientPipeline,
  cloneFundamentalDiagram,
  createTopologyDocument,
  moveOperationInPlan,
  moveVertexInDiagram,
  normalizeAnimationPlan,
  regenerateBoundaryWordsInPlace,
  removeEdgeFromDiagram,
  removeVertexFromDiagram,
  setOperationGroupInPlan,
  type FundamentalDiagram,
  type FundamentalDiagramEdge,
  type QuotientBuildResult,
  type TopologyAnimationPlan,
  type TopologyDocumentView,
  type Vec3,
  isTopologyDocument,
} from "../topology";

type TopologyView = TopologyDocumentView;
type TopologyBuildMode = "preset" | "editor";
type DiagramToolMode = "select" | "addVertex" | "addEdge";

const initialDiagram = () => {
  const preset = TOPOLOGY_PRESET_BY_ID.get(DEFAULT_TOPOLOGY_PRESET_ID) ?? TOPOLOGY_PRESETS[0];
  if (!preset) {
    return {
      id: "topology/empty",
      name: "Empty diagram",
      vertices: [],
      edges: [],
      faces: [],
      edgeOrientations: {},
      edgeLabels: {},
      edgePairings: {},
      vertexLabels: {},
      faceBoundaryWords: {},
      metadata: { description: "No topology presets found." },
    } satisfies FundamentalDiagram;
  }
  return preset.buildDiagram();
};

const diagPoint = (x: number, y: number) => ({ x: 250 + x * 155, y: 180 - y * 145 });
const isoProject = (point: Vec3) => ({ x: 260 + point[0] * 78 + point[2] * 34, y: 180 - point[1] * 72 + point[2] * 16 });

const parsePairings = (raw: string): string[] =>
  [...new Set(raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0))];

const cloneAndPatch = (diagram: FundamentalDiagram, patch: (next: FundamentalDiagram) => void): FundamentalDiagram => {
  const next = cloneFundamentalDiagram(diagram);
  patch(next);
  return next;
};

const edgePeerSet = (diagram: FundamentalDiagram, edgeId: string | null): Set<string> => {
  if (!edgeId) return new Set<string>();
  const peers = new Set<string>([edgeId]);
  const byLabel = diagram.edgeLabels[edgeId]?.trim() ?? "";
  for (const peer of diagram.edgePairings[edgeId] ?? []) peers.add(peer);
  if (byLabel) {
    for (const edge of diagram.edges) {
      if ((diagram.edgeLabels[edge.id] ?? "").trim() === byLabel) peers.add(edge.id);
    }
  }
  return peers;
};

const edgeByIdMap = (diagram: FundamentalDiagram): Map<string, FundamentalDiagramEdge> =>
  new Map(diagram.edges.map((edge) => [edge.id, edge]));

class SmallDsu {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent) {
      this.add(id);
      return id;
    }
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

const DIAGRAM_HISTORY_LIMIT = 120;
const EDGE_CLASS_COLOR_A = "#dc2626";
const EDGE_CLASS_COLOR_B = "#2563eb";
const EDGE_CLASS_COLOR_NEUTRAL = "#334155";

const primaryEdgeLabelToken = (rawLabel: string | undefined | null): string => {
  if (!rawLabel) return "";
  const head = rawLabel
    .trim()
    .toLowerCase()
    .split(/[\/\s]+/)[0] ?? "";
  return head.replace(/[^a-z0-9]/g, "");
};

const edgeColorForLabel = (rawLabel: string | undefined | null, fallback = EDGE_CLASS_COLOR_NEUTRAL): string => {
  const token = primaryEdgeLabelToken(rawLabel);
  if (token === "a") return EDGE_CLASS_COLOR_A;
  if (token === "b") return EDGE_CLASS_COLOR_B;
  return fallback;
};

const isTorusSquareStoryDiagram = (candidate: FundamentalDiagram): boolean => {
  const face = candidate.faces[0];
  if (!face || candidate.edges.length < 4) return false;
  const word = (candidate.faceBoundaryWords[face.id] ?? "").toLowerCase().replace(/\s+/g, "");
  if (word.includes("aba^-1b^-1")) return true;
  const labels = candidate.edges.map((edge) => primaryEdgeLabelToken(candidate.edgeLabels[edge.id]));
  const aCount = labels.filter((label) => label === "a").length;
  const bCount = labels.filter((label) => label === "b").length;
  return aCount >= 2 && bCount >= 2;
};

const isMobiusRectangleStoryDiagram = (candidate: FundamentalDiagram): boolean => {
  const face = candidate.faces[0];
  if (!face || candidate.edges.length < 4) return false;
  const pairedEdges = candidate.edges.filter((edge) => (candidate.edgePairings[edge.id]?.length ?? 0) > 0);
  if (pairedEdges.length < 2) return false;
  const pairLabel = primaryEdgeLabelToken(candidate.edgeLabels[pairedEdges[0]?.id ?? ""]);
  const samePairLabel = pairLabel.length > 0 && pairedEdges.every((edge) => primaryEdgeLabelToken(candidate.edgeLabels[edge.id]) === pairLabel);
  if (!samePairLabel) return false;
  const relationKinds = new Set<number>(pairedEdges.map((edge) => candidate.edgeOrientations[edge.id] ?? 1));
  const hasReversedGluing = relationKinds.size > 1;
  if (!hasReversedGluing) return false;
  const unpaired = candidate.edges.filter((edge) => (candidate.edgePairings[edge.id]?.length ?? 0) === 0);
  return unpaired.length >= 2;
};

const isProjectivePlaneStoryDiagram = (candidate: FundamentalDiagram): boolean => {
  const face = candidate.faces[0];
  if (!face || candidate.edges.length < 4) return false;
  const labels = candidate.edges.map((edge) => primaryEdgeLabelToken(candidate.edgeLabels[edge.id]));
  const aCount = labels.filter((label) => label === "a").length;
  const bCount = labels.filter((label) => label === "b").length;
  if (aCount < 2 || bCount < 2) return false;
  let checkedPairs = 0;
  for (const edge of candidate.edges) {
    const peers = candidate.edgePairings[edge.id] ?? [];
    for (const peer of peers) {
      if (edge.id > peer) continue;
      const a = candidate.edgeOrientations[edge.id] ?? 1;
      const b = candidate.edgeOrientations[peer] ?? 1;
      checkedPairs += 1;
      if (a !== b) return false;
    }
  }
  return checkedPairs >= 2;
};

const buildNarrativeAnimationPlan = (
  sourceDiagram: FundamentalDiagram,
  result: QuotientBuildResult
): TopologyAnimationPlan => {
  const fallback = createDefaultAnimationPlan(result.orientationRelations);
  if (!isTorusSquareStoryDiagram(sourceDiagram) && !isMobiusRectangleStoryDiagram(sourceDiagram)) return fallback;
  const edgeLabels = result.subdividedDiagram.edgeLabels;
  const buckets: Record<"a" | "b" | "other", string[]> = {
    a: [],
    b: [],
    other: [],
  };
  for (const opId of fallback.order) {
    const opIndex = Number(opId.replace("op-", ""));
    const relation = result.orientationRelations[opIndex];
    if (!relation) {
      buckets.other.push(opId);
      continue;
    }
    const tokenA = primaryEdgeLabelToken(edgeLabels[relation.edgeA]);
    const tokenB = primaryEdgeLabelToken(edgeLabels[relation.edgeB]);
    if (tokenA === "a" && tokenB === "a") {
      buckets.a.push(opId);
      continue;
    }
    if (tokenA === "b" && tokenB === "b") {
      buckets.b.push(opId);
      continue;
    }
    buckets.other.push(opId);
  }
  if (isMobiusRectangleStoryDiagram(sourceDiagram)) {
    const order = [...buckets.a, ...buckets.other, ...buckets.b];
    const groups: Record<string, string> = {};
    for (const opId of buckets.a) groups[opId] = "glue-a-twist";
    for (const opId of buckets.other) groups[opId] = "boundary-preserved";
    for (const opId of buckets.b) groups[opId] = "aux-identifications";
    return {
      order: order.length > 0 ? order : fallback.order,
      groups,
    };
  }
  const order = [...buckets.a, ...buckets.b, ...buckets.other];
  const groups: Record<string, string> = {};
  for (const opId of buckets.a) groups[opId] = "glue-a-sides";
  for (const opId of buckets.b) groups[opId] = "glue-b-sides";
  for (const opId of buckets.other) groups[opId] = "aux-identifications";
  return {
    order: order.length > 0 ? order : fallback.order,
    groups,
  };
};

const TORUS_STORY_STAGES = [
  { id: "square", label: "S0: square", detail: "Original square with edge classes." },
  { id: "first-glue", label: "S1: glue a sides", detail: "Start gluing opposite a edges." },
  { id: "cylinder", label: "S2: cylinder", detail: "First quotient gives a cylinder." },
  { id: "second-glue", label: "S3: glue b circles", detail: "Identify the two cylinder rims (b)." },
  { id: "torus", label: "S4: torus", detail: "Topological torus appears." },
  { id: "smooth", label: "S5: smooth realization", detail: "Embedded torus in R^3 with overlays." },
] as const;

const MOBIUS_STORY_STAGES = [
  { id: "rectangle", label: "S0: rectangle", detail: "Flat rectangle with one identified edge pair." },
  { id: "pair", label: "S1: isolate pair", detail: "Mark the reversed a-edge pair to glue." },
  { id: "bend", label: "S2: bend strip", detail: "Lift and bend the strip in 3D." },
  { id: "twist", label: "S3: half-twist", detail: "Rotate one end by 180 degrees." },
  { id: "glue", label: "S4: glue ends", detail: "Attach the reversed edges." },
  { id: "mobius", label: "S5: Möbius band", detail: "Single-sided band with one boundary component." },
  { id: "overlays", label: "S6: overlays", detail: "Highlight boundary loop, core circle, orientation flip." },
] as const;

export const TopologyScreen: React.FC = () => {
  const [diagram, setDiagram] = useState<FundamentalDiagram>(() => {
    const next = initialDiagram();
    regenerateBoundaryWordsInPlace(next);
    return next;
  });
  const [buildMode, setBuildMode] = useState<TopologyBuildMode>("preset");
  const [toolMode, setToolMode] = useState<DiagramToolMode>("select");
  const [presetId, setPresetId] = useState(DEFAULT_TOPOLOGY_PRESET_ID);
  const [buildResult, setBuildResult] = useState<QuotientBuildResult>(() => buildQuotientPipeline(initialDiagram()));
  const [builtSignature, setBuiltSignature] = useState(() => JSON.stringify(initialDiagram()));
  const [savedSignature, setSavedSignature] = useState(() => JSON.stringify(initialDiagram()));
  const [undoStack, setUndoStack] = useState<FundamentalDiagram[]>([]);
  const [redoStack, setRedoStack] = useState<FundamentalDiagram[]>([]);
  const [activeView, setActiveView] = useState<TopologyView>("diagram");
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [selectedVertexId, setSelectedVertexId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingEdgeStartId, setPendingEdgeStartId] = useState<string | null>(null);
  const [appendCreatedEdgesToBoundary, setAppendCreatedEdgesToBoundary] = useState(true);
  const [activeRealizationId, setActiveRealizationId] = useState<string | null>(null);
  const [realizationRenderMode, setRealizationRenderMode] = useState<"scene3d" | "projected2d">("scene3d");
  const [showEdgeClasses, setShowEdgeClasses] = useState(true);
  const [showCornerIdentifications, setShowCornerIdentifications] = useState(true);
  const [showSeams, setShowSeams] = useState(true);
  const [showOneSkeleton, setShowOneSkeleton] = useState(true);
  const [showSmoothRealization, setShowSmoothRealization] = useState(true);
  const [showCutOpenModel, setShowCutOpenModel] = useState(false);
  const [showBoundaryLoop, setShowBoundaryLoop] = useState(true);
  const [showCoreCircle, setShowCoreCircle] = useState(false);
  const [showOrientationFlip, setShowOrientationFlip] = useState(false);
  const [storyRenderMode, setStoryRenderMode] = useState<"explain2d" | "real3d">("explain2d");
  const [timelinePosition, setTimelinePosition] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(initialDiagram(), null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [animationPlan, setAnimationPlan] = useState<TopologyAnimationPlan | null>(null);
  const [currentDocumentPath, setCurrentDocumentPath] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingVertexIdRef = useRef<string | null>(null);
  const draggingStartDiagramRef = useRef<FundamentalDiagram | null>(null);
  const draggingChangedRef = useRef(false);

  const diagramSignature = useMemo(() => JSON.stringify(diagram), [diagram]);
  const buildStale = diagramSignature !== builtSignature;
  const dirty = diagramSignature !== savedSignature;
  const edgeById = useMemo(() => edgeByIdMap(diagram), [diagram]);
  const highlightEdges = useMemo(() => edgePeerSet(diagram, hoverEdgeId), [diagram, hoverEdgeId]);
  const normalizedAnimationPlan = useMemo(
    () => normalizeAnimationPlan(buildResult.orientationRelations, animationPlan),
    [buildResult.orientationRelations, animationPlan]
  );
  const timelineOperations = useMemo(
    () => buildPlannedOperations(buildResult.orientationRelations, normalizedAnimationPlan),
    [buildResult.orientationRelations, normalizedAnimationPlan]
  );
  const timelineSteps = useMemo(
    () => buildPlannedSteps(buildResult.orientationRelations, normalizedAnimationPlan),
    [buildResult.orientationRelations, normalizedAnimationPlan]
  );
  const timelineMax = timelineSteps.length + 1;
  const timelineCompletedOperationCounts = useMemo(() => {
    const out: number[] = [0];
    let total = 0;
    for (const step of timelineSteps) {
      total += step.operations.length;
      out.push(total);
    }
    return out;
  }, [timelineSteps]);
  const torusStoryEnabled = useMemo(() => isTorusSquareStoryDiagram(diagram), [diagram]);
  const mobiusStoryEnabled = useMemo(() => isMobiusRectangleStoryDiagram(diagram), [diagram]);
  const projectiveStoryEnabled = useMemo(() => isProjectivePlaneStoryDiagram(diagram), [diagram]);

  const resetHistory = () => {
    setUndoStack([]);
    setRedoStack([]);
  };

  const setDiagramAndDraft = (next: FundamentalDiagram, options?: { pushHistory?: boolean; markSaved?: boolean }) => {
    regenerateBoundaryWordsInPlace(next);
    const nextSignature = JSON.stringify(next);
    if (options?.pushHistory && nextSignature !== diagramSignature) {
      setUndoStack((prev) => [...prev.slice(-(DIAGRAM_HISTORY_LIMIT - 1)), cloneFundamentalDiagram(diagram)]);
      setRedoStack([]);
    }
    setDiagram(next);
    setJsonDraft(JSON.stringify(next, null, 2));
    if (options?.markSaved) {
      setSavedSignature(nextSignature);
    }
  };

  const applyDiagramNarrativeDefaults = (next: FundamentalDiagram) => {
    if (isMobiusRectangleStoryDiagram(next)) {
      setShowSmoothRealization(true);
      setShowCutOpenModel(false);
      setShowBoundaryLoop(true);
      setShowCoreCircle(false);
      setShowOrientationFlip(false);
      setShowSeams(true);
      setShowOneSkeleton(true);
      setStoryRenderMode("real3d");
      return;
    }
    if (isTorusSquareStoryDiagram(next)) {
      setShowSmoothRealization(true);
      setShowCutOpenModel(false);
      setShowBoundaryLoop(false);
      setShowCoreCircle(false);
      setShowOrientationFlip(false);
      setShowSeams(true);
      setShowOneSkeleton(true);
      setStoryRenderMode("explain2d");
      return;
    }
    if (isProjectivePlaneStoryDiagram(next)) {
      setShowSmoothRealization(true);
      setShowCutOpenModel(false);
      setShowBoundaryLoop(false);
      setShowCoreCircle(false);
      setShowOrientationFlip(false);
      setShowSeams(true);
      setShowOneSkeleton(true);
      setStoryRenderMode("real3d");
    }
  };

  const applyPreset = (nextPresetId: string) => {
    const preset = TOPOLOGY_PRESET_BY_ID.get(nextPresetId);
    if (!preset) return;
    const nextDiagram = preset.buildDiagram();
    regenerateBoundaryWordsInPlace(nextDiagram);
    const nextResult = buildQuotientPipeline(nextDiagram);
    setBuildMode("preset");
    setPresetId(nextPresetId);
    setDiagramAndDraft(nextDiagram, { markSaved: true });
    resetHistory();
    setBuildResult(nextResult);
    setBuiltSignature(JSON.stringify(nextDiagram));
    setActiveRealizationId(nextResult.realizations[0]?.id ?? null);
    setActiveView("diagram");
    setTimelinePosition(0);
    setTimelinePlaying(false);
    setAnimationPlan(buildNarrativeAnimationPlan(nextDiagram, nextResult));
    applyDiagramNarrativeDefaults(nextDiagram);
    setSelectedVertexId(null);
    setSelectedEdgeId(null);
    setPendingEdgeStartId(null);
    setCurrentDocumentPath(null);
    setDocStatus(`Loaded preset '${preset.label}'.`);
    setDocError(null);
    setJsonError(null);
  };

  const ensureBuilt = () => {
    if (!buildStale) return buildResult;
    const nextResult = buildQuotientPipeline(diagram);
    setBuildResult(nextResult);
    setBuiltSignature(diagramSignature);
    setAnimationPlan((prev) =>
      prev
        ? normalizeAnimationPlan(nextResult.orientationRelations, prev)
        : buildNarrativeAnimationPlan(diagram, nextResult)
    );
    if (!nextResult.realizations.some((entry) => entry.id === activeRealizationId)) {
      setActiveRealizationId(nextResult.realizations[0]?.id ?? null);
    }
    return nextResult;
  };

  const handleBuild = () => {
    ensureBuilt();
    setActiveView("quotient");
  };

  const toDiagramCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const normX = (clientX - rect.left) / rect.width;
    const normY = (clientY - rect.top) / rect.height;
    const viewX = 520 * normX;
    const viewY = 360 * normY;
    return {
      x: (viewX - 250) / 155,
      y: (180 - viewY) / 145,
    };
  };

  const handleVertexDown = (event: React.PointerEvent<SVGCircleElement>, vertexId: string) => {
    if (toolMode !== "select") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingVertexIdRef.current = vertexId;
    draggingStartDiagramRef.current = cloneFundamentalDiagram(diagram);
    draggingChangedRef.current = false;
    setSelectedVertexId(vertexId);
    setSelectedEdgeId(null);
  };

  const handleSvgPointerMove: React.PointerEventHandler<SVGSVGElement> = (event) => {
    const draggingId = draggingVertexIdRef.current;
    if (!draggingId) return;
    const p = toDiagramCoords(event.clientX, event.clientY);
    if (!p) return;
    const next = moveVertexInDiagram(diagram, draggingId, p.x, p.y);
    if (JSON.stringify(next) !== diagramSignature) {
      draggingChangedRef.current = true;
    }
    setDiagramAndDraft(next);
  };

  const stopDragging = () => {
    if (draggingChangedRef.current && draggingStartDiagramRef.current) {
      setUndoStack((prev) => [...prev.slice(-(DIAGRAM_HISTORY_LIMIT - 1)), draggingStartDiagramRef.current!]);
      setRedoStack([]);
    }
    draggingVertexIdRef.current = null;
    draggingStartDiagramRef.current = null;
    draggingChangedRef.current = false;
  };

  const createEdge = (fromId: string, toId: string) => {
    const next = addEdgeToDiagram(diagram, fromId, toId, appendCreatedEdgesToBoundary);
    setDiagramAndDraft(next, { pushHistory: true });
  };

  const handleDiagramBackgroundClick: React.MouseEventHandler<SVGSVGElement> = (event) => {
    if (toolMode !== "addVertex") return;
    const p = toDiagramCoords(event.clientX, event.clientY);
    if (!p) return;
    const next = addVertexToDiagram(diagram, p.x, p.y);
    setDiagramAndDraft(next, { pushHistory: true });
  };

  const handleVertexClick = (vertexId: string) => {
    if (toolMode === "addEdge") {
      if (!pendingEdgeStartId) {
        setPendingEdgeStartId(vertexId);
        return;
      }
      createEdge(pendingEdgeStartId, vertexId);
      setPendingEdgeStartId(null);
      return;
    }
    setSelectedVertexId(vertexId);
    setSelectedEdgeId(null);
  };

  const handleEdgeClick = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedVertexId(null);
  };

  const handleRemoveSelectedVertex = () => {
    if (!selectedVertexId) return;
    const next = removeVertexFromDiagram(diagram, selectedVertexId);
    setDiagramAndDraft(next, { pushHistory: true });
    setSelectedVertexId(null);
    setSelectedEdgeId(null);
  };

  const handleRemoveSelectedEdge = () => {
    if (!selectedEdgeId) return;
    const next = removeEdgeFromDiagram(diagram, selectedEdgeId);
    setDiagramAndDraft(next, { pushHistory: true });
    setSelectedEdgeId(null);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const nextUndo = [...undoStack];
    const previous = nextUndo.pop();
    if (!previous) return;
    setUndoStack(nextUndo);
    setRedoStack((prev) => [...prev.slice(-(DIAGRAM_HISTORY_LIMIT - 1)), cloneFundamentalDiagram(diagram)]);
    setDiagramAndDraft(cloneFundamentalDiagram(previous));
    setSelectedEdgeId(null);
    setSelectedVertexId(null);
    setPendingEdgeStartId(null);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextRedo = [...redoStack];
    const upcoming = nextRedo.pop();
    if (!upcoming) return;
    setRedoStack(nextRedo);
    setUndoStack((prev) => [...prev.slice(-(DIAGRAM_HISTORY_LIMIT - 1)), cloneFundamentalDiagram(diagram)]);
    setDiagramAndDraft(cloneFundamentalDiagram(upcoming));
    setSelectedEdgeId(null);
    setSelectedVertexId(null);
    setPendingEdgeStartId(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [diagram, undoStack, redoStack]);

  useEffect(() => {
    if (!timelinePlaying) return;
    const handle = window.setInterval(() => {
      setTimelinePosition((prev) => {
        const next = Math.min(timelineMax, prev + 1);
        if (next >= timelineMax) {
          setTimelinePlaying(false);
        }
        return next;
      });
    }, 900);
    return () => window.clearInterval(handle);
  }, [timelineMax, timelinePlaying]);

  useEffect(() => {
    setTimelinePosition((prev) => Math.max(0, Math.min(timelineMax, prev)));
  }, [timelineMax]);

  const applyLoadedTopologyPayload = (raw: unknown, sourceLabel: string, sourcePath: string | null) => {
    if (isTopologyDocument(raw)) {
      const loadedDiagram = raw.payload.diagram;
      regenerateBoundaryWordsInPlace(loadedDiagram);
      setDiagramAndDraft(loadedDiagram, { markSaved: true });
      resetHistory();
      setBuildMode("editor");
      if (raw.payload.cache?.buildResult) {
        setBuildResult(raw.payload.cache.buildResult);
        setBuiltSignature(JSON.stringify(loadedDiagram));
        setActiveView(raw.payload.cache.activeView ?? "diagram");
        setActiveRealizationId(raw.payload.cache.activeRealizationId ?? raw.payload.cache.buildResult.realizations[0]?.id ?? null);
        setAnimationPlan(normalizeAnimationPlan(raw.payload.cache.buildResult.orientationRelations, raw.payload.cache.animationPlan));
        applyDiagramNarrativeDefaults(loadedDiagram);
      } else {
        const built = buildQuotientPipeline(loadedDiagram);
        setBuildResult(built);
        setBuiltSignature(JSON.stringify(loadedDiagram));
        setActiveView("diagram");
        setActiveRealizationId(built.realizations[0]?.id ?? null);
        setAnimationPlan(buildNarrativeAnimationPlan(loadedDiagram, built));
        applyDiagramNarrativeDefaults(loadedDiagram);
      }
      setTimelinePosition(0);
      setTimelinePlaying(false);
      setSelectedEdgeId(null);
      setSelectedVertexId(null);
      setPendingEdgeStartId(null);
      setPresetId(DEFAULT_TOPOLOGY_PRESET_ID);
      setCurrentDocumentPath(sourcePath);
      setDocStatus(`Loaded ${sourceLabel}`);
      setDocError(null);
      return true;
    }
    if ((raw as any)?.edges && (raw as any)?.vertices && (raw as any)?.faces) {
      const loadedDiagram = raw as FundamentalDiagram;
      regenerateBoundaryWordsInPlace(loadedDiagram);
      setDiagramAndDraft(loadedDiagram, { markSaved: true });
      resetHistory();
      const built = buildQuotientPipeline(loadedDiagram);
      setBuildResult(built);
      setBuiltSignature(JSON.stringify(loadedDiagram));
      setBuildMode("editor");
      setActiveView("diagram");
      setActiveRealizationId(built.realizations[0]?.id ?? null);
      setAnimationPlan(buildNarrativeAnimationPlan(loadedDiagram, built));
      applyDiagramNarrativeDefaults(loadedDiagram);
      setTimelinePosition(0);
      setTimelinePlaying(false);
      setCurrentDocumentPath(sourcePath);
      setDocStatus(`Loaded diagram ${sourceLabel}`);
      setDocError(null);
      return true;
    }
    return false;
  };

  const saveTopologyDocument = async (saveAs = false) => {
    const built = ensureBuilt();
    const doc = createTopologyDocument(diagram, {
      buildResult: built,
      activeView,
      activeRealizationId,
      animationPlan: normalizedAnimationPlan,
    });
    const text = JSON.stringify(doc, null, 2);
    const cleanName = (diagram.name || "topology")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "topology";
    const suggestedName = `${cleanName}${TOPOLOGY_DOCUMENT_EXTENSION}`;

    if (window.topologyDocuments?.save) {
      const result = await window.topologyDocuments.save({
        suggestedName,
        defaultPath: saveAs ? undefined : currentDocumentPath ?? undefined,
        content: text,
      });
      if (result.ok) {
        setCurrentDocumentPath(result.path);
        setSavedSignature(diagramSignature);
        setDocStatus(`Saved ${result.path}`);
        setDocError(null);
      } else if (!result.canceled) {
        setDocError(result.error || "Failed to save topology document.");
        setDocStatus(null);
      }
      return;
    }

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.click();
    URL.revokeObjectURL(url);
    setSavedSignature(diagramSignature);
    setCurrentDocumentPath(null);
    setDocStatus(`Saved ${anchor.download}`);
    setDocError(null);
  };

  const loadTopologyDocument = async () => {
    if (window.topologyDocuments?.open) {
      const result = await window.topologyDocuments.open();
      if (result.ok) {
        try {
          const raw = JSON.parse(result.content);
          const applied = applyLoadedTopologyPayload(raw, result.path, result.path);
          if (!applied) {
            setDocError("Unsupported topology document format.");
            setDocStatus(null);
          }
        } catch (error) {
          setDocError(`Failed to parse file: ${String((error as Error).message ?? error)}`);
          setDocStatus(null);
        }
      } else if (!result.canceled) {
        setDocError(result.error || "Failed to open topology document.");
        setDocStatus(null);
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${TOPOLOGY_DOCUMENT_EXTENSION},.json,application/json`;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => {
        setDocError("Failed to read the selected file.");
        setDocStatus(null);
      };
      reader.onload = () => {
        try {
          const text = String(reader.result ?? "");
          const raw = JSON.parse(text);
          const applied = applyLoadedTopologyPayload(raw, file.name, null);
          if (!applied) {
            setDocError("Unsupported topology document format.");
            setDocStatus(null);
          }
        } catch (error) {
          setDocError(`Failed to parse file: ${String((error as Error).message ?? error)}`);
          setDocStatus(null);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const renderDiagramView = () => {
    const face = diagram.faces[0];
    const polygonPoints =
      face?.boundary
        .map((entry) => {
          const edge = edgeById.get(entry.edgeId);
          if (!edge) return null;
          const vertexId = entry.direction > 0 ? edge.from : edge.to;
          const vertex = diagram.vertices.find((candidate) => candidate.id === vertexId);
          if (!vertex) return null;
          const point = diagPoint(vertex.x, vertex.y);
          return `${point.x},${point.y}`;
        })
        .filter((item): item is string => !!item) ?? [];

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>Geometry tools</span>
          {([
            ["select", "Select/Drag"],
            ["addVertex", "Add Vertex"],
            ["addEdge", "Add Edge"],
          ] as const).map(([id, label]) => (
            <button
              key={`diagram-tool-${id}`}
              type="button"
              onClick={() => {
                setToolMode(id);
                setPendingEdgeStartId(null);
              }}
              style={{
                borderRadius: 999,
                border: "1px solid " + (toolMode === id ? "#0a66c2" : "#d1d5db"),
                background: toolMode === id ? "#e6f0ff" : "#fff",
                fontSize: 11,
                fontWeight: toolMode === id ? 700 : 600,
                padding: "4px 10px",
              }}
            >
              {label}
            </button>
          ))}
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={appendCreatedEdgesToBoundary}
              onChange={(event) => setAppendCreatedEdgesToBoundary(event.target.checked)}
            />
            append new edges to face boundary
          </label>
          <button type="button" onClick={handleRemoveSelectedVertex} disabled={!selectedVertexId}>
            Remove Vertex
          </button>
          <button type="button" onClick={handleRemoveSelectedEdge} disabled={!selectedEdgeId}>
            Remove Edge
          </button>
          <button type="button" onClick={handleUndo} disabled={undoStack.length === 0}>
            Undo
          </button>
          <button type="button" onClick={handleRedo} disabled={redoStack.length === 0}>
            Redo
          </button>
        </div>

        <svg
          ref={svgRef}
          width="100%"
          viewBox="0 0 520 360"
          style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}
          onMouseLeave={() => setHoverEdgeId(null)}
          onPointerUp={stopDragging}
          onPointerLeave={stopDragging}
          onPointerCancel={stopDragging}
          onPointerMove={handleSvgPointerMove}
          onClick={handleDiagramBackgroundClick}
        >
          <defs>
            <marker id="edgeArrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth">
              <polygon points="0 0, 8 3.5, 0 7" fill="#1e293b" />
            </marker>
          </defs>
          {polygonPoints.length >= 3 && (
            <polygon points={polygonPoints.join(" ")} fill="#f8fbff" stroke="#d1d9e5" strokeWidth={1.2} />
          )}

          {diagram.edges.map((edge) => {
            const from = diagram.vertices.find((vertex) => vertex.id === edge.from);
            const to = diagram.vertices.find((vertex) => vertex.id === edge.to);
            if (!from || !to) return null;
            const orientation = diagram.edgeOrientations[edge.id] ?? 1;
            const pointFrom = diagPoint(from.x, from.y);
            const pointTo = diagPoint(to.x, to.y);
            const arrowStart = orientation > 0 ? pointFrom : pointTo;
            const arrowEnd = orientation > 0 ? pointTo : pointFrom;
            const mid = { x: (pointFrom.x + pointTo.x) / 2, y: (pointFrom.y + pointTo.y) / 2 };
            const highlighted = highlightEdges.has(edge.id);
            const classColor = edgeColorForLabel(diagram.edgeLabels[edge.id], EDGE_CLASS_COLOR_NEUTRAL);
            return (
              <g key={`diagram-edge-${edge.id}`} onMouseEnter={() => setHoverEdgeId(edge.id)} style={{ cursor: "pointer" }}>
                <line
                  x1={arrowStart.x}
                  y1={arrowStart.y}
                  x2={arrowEnd.x}
                  y2={arrowEnd.y}
                  stroke={highlighted ? "#0a66c2" : classColor}
                  strokeWidth={selectedEdgeId === edge.id ? 3.4 : highlighted ? 3 : 2}
                  markerEnd="url(#edgeArrow)"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEdgeClick(edge.id);
                  }}
                />
                <text
                  x={mid.x}
                  y={mid.y - 7}
                  textAnchor="middle"
                  style={{
                    fontSize: 11,
                    fontWeight: highlighted ? 700 : 600,
                    fill: highlighted ? "#0a66c2" : classColor,
                  }}
                >
                  {diagram.edgeLabels[edge.id] || edge.id}
                </text>
                <text x={mid.x} y={mid.y + 8} textAnchor="middle" style={{ fontSize: 9, fill: "#64748b" }}>
                  {edge.id}
                </text>
              </g>
            );
          })}

          {diagram.vertices.map((vertex) => {
            const point = diagPoint(vertex.x, vertex.y);
            const label = diagram.vertexLabels[vertex.id] || vertex.id;
            return (
              <g key={`diagram-vertex-${vertex.id}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={selectedVertexId === vertex.id ? 7 : 5}
                  fill={selectedVertexId === vertex.id ? "#0a66c2" : "#0f172a"}
                  style={{ cursor: toolMode === "addEdge" || toolMode === "select" ? "pointer" : "crosshair" }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    handleVertexDown(event, vertex.id);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleVertexClick(vertex.id);
                  }}
                />
                <text x={point.x + 8} y={point.y - 8} style={{ fontSize: 11, fill: "#0f172a", fontWeight: 600 }}>
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ fontSize: 11, color: "#475569", display: "grid", gap: 3 }}>
          <div>
            Hover edge to highlight pairing class. Current face word:{" "}
            <strong>{diagram.faceBoundaryWords[diagram.faces[0]?.id ?? ""] || "(none)"}</strong>
          </div>
          {hoverEdgeId && (
            <div>
              Selected edge: <strong>{hoverEdgeId}</strong> - peers:{" "}
              {Array.from(highlightEdges).sort((a, b) => a.localeCompare(b)).join(", ")}
            </div>
          )}
          {toolMode === "addEdge" && (
            <div>
              Add-edge mode: {pendingEdgeStartId ? `choose end vertex (start ${pendingEdgeStartId})` : "choose start vertex"}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderQuotientView = () => {
    const result = ensureBuilt();
    const quotient = result.quotient;
    const positions: Record<string, { x: number; y: number }> = {};
    const count = quotient.vertices.length;
    quotient.vertices.forEach((vertex, index) => {
      if (count <= 1) {
        positions[vertex.id] = { x: 260, y: 180 };
        return;
      }
      const angle = (Math.PI * 2 * index) / count;
      positions[vertex.id] = { x: 260 + 130 * Math.cos(angle), y: 180 + 112 * Math.sin(angle) };
    });

    return (
      <div style={{ display: "grid", gap: 10 }}>
        <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
          {quotient.edges.map((edge, index) => {
            const from = positions[edge.endpointVertexIds[0]];
            const to = positions[edge.endpointVertexIds[1]];
            if (!from || !to) return null;
            const classColor = edgeColorForLabel(edge.label, "#0f172a");
            if (edge.endpointVertexIds[0] === edge.endpointVertexIds[1]) {
              const radius = 22 + index * 7;
              const path = `M ${from.x} ${from.y - radius} C ${from.x + radius} ${from.y - radius - 24} ${from.x - radius} ${from.y - radius - 24} ${from.x} ${from.y - radius}`;
              return (
                <g key={`q-edge-loop-${edge.id}`}>
                  <path d={path} fill="none" stroke={classColor} strokeWidth={2.3} />
                  <text x={from.x + radius + 4} y={from.y - radius - 10} style={{ fontSize: 10, fill: classColor }}>
                    {edge.label}
                  </text>
                </g>
              );
            }
            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
            return (
              <g key={`q-edge-${edge.id}`}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={classColor} strokeWidth={2.4} />
                <text x={mid.x + 6} y={mid.y - 6} style={{ fontSize: 10, fill: classColor }}>
                  {edge.label}
                </text>
              </g>
            );
          })}
          {quotient.vertices.map((vertex) => {
            const point = positions[vertex.id];
            if (!point) return null;
            return (
              <g key={`q-vertex-${vertex.id}`}>
                <circle cx={point.x} cy={point.y} r={7} fill="#0a66c2" />
                <text x={point.x + 10} y={point.y - 10} style={{ fontSize: 11, fill: "#0f172a", fontWeight: 700 }}>
                  {vertex.id}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Equivalence classes</div>
            <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
              {buildResult.vertexClasses.map((entry) => (
                <div key={`v-class-${entry.id}`}>
                  <strong>{entry.id}</strong>: {entry.sourceIds.join(" = ")}
                </div>
              ))}
              {buildResult.edgeClasses.map((entry) => (
                <div key={`e-class-${entry.id}`}>
                  <strong>{entry.id}</strong>: {entry.sourceIds.join(" = ")}
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Face attachments</div>
            <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
              {buildResult.quotient.faces.map((face) => {
                const attachment = buildResult.quotient.attachmentMap[face.attachmentId];
                return (
                  <div key={`attachment-${face.id}`}>
                    <strong>{face.id}</strong>: {attachment?.boundaryWord || "(missing)"}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>CW Inspector: incidence</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>Vertex {"->"} incident edges</div>
            <div style={{ fontSize: 10, display: "grid", gap: 3, maxHeight: 140, overflowY: "auto" }}>
              {quotient.vertices.map((vertex) => (
                <div key={`inc-v-${vertex.id}`}>
                  <strong>{vertex.id}</strong>: {(quotient.incidences.vertexToEdges[vertex.id] ?? []).join(", ") || "(none)"}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Edge {"->"} attached faces</div>
            <div style={{ fontSize: 10, display: "grid", gap: 3, maxHeight: 140, overflowY: "auto" }}>
              {quotient.edges.map((edge) => (
                <div key={`inc-e-${edge.id}`}>
                  <strong>{edge.id}</strong>: {(quotient.incidences.edgeToFaces[edge.id] ?? []).join(", ") || "(none)"}
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>CW Inspector: boundary & orientation</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>Cell boundary data</div>
            <div style={{ fontSize: 10, display: "grid", gap: 3, maxHeight: 120, overflowY: "auto" }}>
              {quotient.cellBoundaries.map((boundary) => (
                <div key={`boundary-${boundary.faceId}`}>
                  <strong>{boundary.faceId}</strong>:{" "}
                  {boundary.edgeWalk.map((entry) => `${entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`).join(" ")}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Orientation matches/reversals</div>
            <div style={{ fontSize: 10, display: "grid", gap: 3, maxHeight: 120, overflowY: "auto" }}>
              {result.orientationRelations.length === 0 && <div>(none)</div>}
              {result.orientationRelations.map((relation, index) => (
                <div key={`orientation-${relation.edgeA}-${relation.edgeB}-${index}`}>
                  {relation.edgeA} ~ {relation.edgeB}: <strong>{relation.relation}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRealizationView = () => {
    const result = ensureBuilt();
    const selectedRealization =
      result.realizations.find((entry) => entry.id === activeRealizationId) ??
      result.realizations[0];
    const smoothTorusRealization = result.realizations.find((entry) => entry.id.endsWith("/realization/torus-smooth"));
    const cutOpenTorusRealization = result.realizations.find((entry) => entry.id.endsWith("/realization/torus-cut-open"));
    const smoothMobiusRealization = result.realizations.find((entry) => entry.id.endsWith("/realization/mobius-smooth"));
    const cutOpenMobiusRealization = result.realizations.find((entry) => entry.id.endsWith("/realization/mobius-cut-open"));
    const projectiveImmersedRealization = result.realizations.find((entry) => entry.id.endsWith("/realization/projective-immersed"));
    const torusRealizationAvailable = !!smoothTorusRealization || !!cutOpenTorusRealization;
    const mobiusRealizationAvailable = !!smoothMobiusRealization || !!cutOpenMobiusRealization;
    const projectiveRealizationAvailable = !!projectiveImmersedRealization;
    const canonicalRealizationAvailable = torusRealizationAvailable || mobiusRealizationAvailable || projectiveRealizationAvailable;
    const cutOpenRealizationAvailable =
      (!!cutOpenMobiusRealization && mobiusRealizationAvailable) || (!!cutOpenTorusRealization && torusRealizationAvailable);
    const realization =
      canonicalRealizationAvailable && showSmoothRealization
        ? mobiusRealizationAvailable
          ? showCutOpenModel
            ? cutOpenMobiusRealization ?? smoothMobiusRealization ?? selectedRealization
            : smoothMobiusRealization ?? selectedRealization
          : torusRealizationAvailable
            ? showCutOpenModel
              ? cutOpenTorusRealization ?? smoothTorusRealization ?? selectedRealization
              : smoothTorusRealization ?? selectedRealization
            : projectiveImmersedRealization ?? selectedRealization
        : selectedRealization;
    if (!realization) return <div style={{ fontSize: 12 }}>No realization available.</div>;
    const seamEdgeIds = new Set(realization.seams.map((entry) => entry.edgeId));
    const quotientEdgeLabelById = new Map(result.quotient.edges.map((edge) => [edge.id, edge.label]));
    const hiddenEdgeIds = [
      ...(showBoundaryLoop ? [] : ["mobius_boundary"]),
      ...(showCoreCircle ? [] : ["mobius_core"]),
      ...(showOrientationFlip ? [] : ["mobius_orient_track", "mobius_orient_normal_start", "mobius_orient_normal_end"]),
      ...(showCutOpenModel ? [] : ["mobius_cut"]),
    ];
    const edgeColorOverrides = showEdgeClasses
      ? Object.fromEntries(
          Object.keys(realization.edgeCurves)
            .map((edgeId) => {
              if (edgeId === "cut_u") return [edgeId, EDGE_CLASS_COLOR_A] as const;
              if (edgeId === "cut_v") return [edgeId, EDGE_CLASS_COLOR_B] as const;
              if (edgeId === "mobius_boundary") return [edgeId, "#0ea5e9"] as const;
              if (edgeId === "mobius_core") return [edgeId, "#f97316"] as const;
              if (edgeId === "mobius_orient_track") return [edgeId, "#9333ea"] as const;
              if (edgeId === "mobius_orient_normal_start") return [edgeId, "#16a34a"] as const;
              if (edgeId === "mobius_orient_normal_end") return [edgeId, "#dc2626"] as const;
              if (edgeId === "mobius_cut") return [edgeId, "#0f766e"] as const;
              if (edgeId === "rp2_self_intersection") return [edgeId, "#ea580c"] as const;
              const label = quotientEdgeLabelById.get(edgeId);
              const color = edgeColorForLabel(label, "");
              return color ? ([edgeId, color] as const) : null;
            })
            .filter((entry): entry is readonly [string, string] => !!entry)
        )
      : {};
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>Render mode</span>
          <button
            type="button"
            onClick={() => setRealizationRenderMode("scene3d")}
            style={{
              borderRadius: 999,
              border: "1px solid " + (realizationRenderMode === "scene3d" ? "#0a66c2" : "#d1d5db"),
              background: realizationRenderMode === "scene3d" ? "#e6f0ff" : "#fff",
              fontSize: 11,
              fontWeight: realizationRenderMode === "scene3d" ? 700 : 600,
              padding: "4px 10px",
            }}
          >
            3D scene
          </button>
          <button
            type="button"
            onClick={() => setRealizationRenderMode("projected2d")}
            style={{
              borderRadius: 999,
              border: "1px solid " + (realizationRenderMode === "projected2d" ? "#0a66c2" : "#d1d5db"),
              background: realizationRenderMode === "projected2d" ? "#e6f0ff" : "#fff",
              fontSize: 11,
              fontWeight: realizationRenderMode === "projected2d" ? 700 : 600,
              padding: "4px 10px",
            }}
          >
            projected 2D
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11 }}>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={showEdgeClasses} onChange={(event) => setShowEdgeClasses(event.target.checked)} />
            Show edge classes
          </label>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showCornerIdentifications}
              onChange={(event) => setShowCornerIdentifications(event.target.checked)}
            />
            Show corner identifications
          </label>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={showSeams} onChange={(event) => setShowSeams(event.target.checked)} />
            Show seams
          </label>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={showOneSkeleton} onChange={(event) => setShowOneSkeleton(event.target.checked)} />
            Show 1-skeleton
          </label>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showSmoothRealization}
              disabled={!canonicalRealizationAvailable}
              onChange={(event) => setShowSmoothRealization(event.target.checked)}
            />
            Show smooth realization
          </label>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showCutOpenModel}
              disabled={!cutOpenRealizationAvailable || !showSmoothRealization}
              onChange={(event) => setShowCutOpenModel(event.target.checked)}
            />
            Show cut-open model
          </label>
          {mobiusRealizationAvailable && (
            <>
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={showBoundaryLoop}
                  onChange={(event) => setShowBoundaryLoop(event.target.checked)}
                />
                Show boundary loop
              </label>
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={showCoreCircle}
                  onChange={(event) => setShowCoreCircle(event.target.checked)}
                />
                Show core circle
              </label>
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={showOrientationFlip}
                  onChange={(event) => setShowOrientationFlip(event.target.checked)}
                />
                Show orientation flip
              </label>
            </>
          )}
        </div>

        {realizationRenderMode === "scene3d" ? (
          <TopologyRealization3DView
            realization={realization}
            height={390}
            showSeams={showSeams}
            showSkeleton={showOneSkeleton}
            showSingularityMarkers={showCornerIdentifications}
            edgeColorOverrides={edgeColorOverrides}
            hiddenEdgeIds={hiddenEdgeIds}
            orientationFlipOverlay={
              mobiusRealizationAvailable && showOrientationFlip
                ? {
                    trackEdgeId: "mobius_orient_track",
                    startNormalEdgeId: "mobius_orient_normal_start",
                    endNormalEdgeId: "mobius_orient_normal_end",
                    speed: 0.1,
                    color: "#9333ea",
                  }
                : null
            }
          />
        ) : (
          <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
            {realization.faceRealizationMesh.flatMap((mesh) =>
              mesh.triangles.map((triangle, index) => {
                const a = isoProject(mesh.vertices[triangle[0]]);
                const b = isoProject(mesh.vertices[triangle[1]]);
                const c = isoProject(mesh.vertices[triangle[2]]);
                const points = `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`;
                return (
                  <polygon
                    key={`face-tri-${mesh.faceId}-${index}`}
                    points={points}
                    fill={realization.style.faceFill}
                    opacity={0.55}
                    stroke="#93c5fd"
                    strokeWidth={0.6}
                  />
                );
              })
            )}

            {showOneSkeleton &&
              Object.entries(realization.edgeCurves).map(([edgeId, points]) => {
                if (points.length < 2) return null;
                if (hiddenEdgeIds.includes(edgeId)) return null;
                const polyline = points.map((point) => isoProject(point)).map((point) => `${point.x},${point.y}`).join(" ");
                const seam = seamEdgeIds.has(edgeId);
                const drawAsSeam = seam && showSeams;
                return (
                  <polyline
                    key={`real-edge-${edgeId}`}
                    points={polyline}
                    fill="none"
                    stroke={edgeColorOverrides[edgeId] ?? (drawAsSeam ? realization.style.seamStroke : realization.style.edgeStroke)}
                    strokeWidth={drawAsSeam ? 2.8 : 1.9}
                    strokeDasharray={drawAsSeam ? "6 3" : undefined}
                  />
                );
              })}

            {Object.entries(realization.vertexPositions).map(([vertexId, point]) => {
              const pos = isoProject(point);
              const singularity = realization.singularityMarkers.find((entry) => entry.vertexId === vertexId);
              return (
                <g key={`real-vertex-${vertexId}`}>
                  <circle cx={pos.x} cy={pos.y} r={4.8} fill="#0f172a" />
                  {showCornerIdentifications && singularity && (
                    <circle cx={pos.x} cy={pos.y} r={8.2} fill="none" stroke={realization.style.singularityColor} strokeWidth={1.8} />
                  )}
                  <text x={pos.x + 7} y={pos.y - 8} style={{ fontSize: 10, fill: "#0f172a", fontWeight: 700 }}>
                    {vertexId}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        <div style={{ fontSize: 11, color: "#475569", display: "grid", gap: 3 }}>
          <div>
            Realization is independent from quotient data and can be replaced by alternate embeddings for the same quotient complex.
          </div>
          <div>
            Seams: {realization.seams.length} | singular markers: {realization.singularityMarkers.length}
          </div>
          {mobiusRealizationAvailable && (
            <div>
              Möbius overlays: boundary loop (single component), core circle, and orientation-flip markers.
            </div>
          )}
          {projectiveRealizationAvailable && (
            <>
              <div>Immersed realization of RP^2 in R^3 (cross-cap style).</div>
              <div>Topological type: closed, non-orientable surface (no boundary).</div>
              <div>RP^2 cannot be embedded in R^3 without self-intersection.</div>
              <div>Self-intersection belongs to the model in space, not to the abstract quotient itself.</div>
              <div>This is not a torus.</div>
            </>
          )}
          <div>
            Edge classes keep consistent colors: a in red, b in blue.
          </div>
        </div>
      </div>
    );
  };

  const renderAnimationView = () => {
    const result = ensureBuilt();
    const realization =
      result.realizations.find((entry) => entry.id === activeRealizationId) ??
      result.realizations[0];
    if (!realization) return <div style={{ fontSize: 12 }}>No realization available.</div>;
    const edgeById = new Map(result.subdividedDiagram.edges.map((edge) => [edge.id, edge]));
    const sourceVertices = diagram.vertices.map((vertex) => vertex.id);
    const projectedStart: Record<string, { x: number; y: number }> = {};
    const projectedFinal: Record<string, { x: number; y: number }> = {};
    for (const vertex of diagram.vertices) {
      projectedStart[vertex.id] = diagPoint(vertex.x, vertex.y);
      const qVertexId = result.vertexClassBySource[vertex.id];
      const qPos = qVertexId ? realization.vertexPositions[qVertexId] : null;
      projectedFinal[vertex.id] = qPos ? isoProject(qPos) : diagPoint(vertex.x, vertex.y);
    }

    const partialTargetFor = (opCount: number): Record<string, { x: number; y: number }> => {
      const dsu = new SmallDsu();
      for (const vertexId of sourceVertices) dsu.add(vertexId);
      for (let index = 0; index < Math.min(opCount, timelineOperations.length); index += 1) {
        const op = timelineOperations[index];
        const edgeA = edgeById.get(op.relation.edgeA);
        const edgeB = edgeById.get(op.relation.edgeB);
        if (!edgeA || !edgeB) continue;
        if (op.relation.relation === "match") {
          dsu.union(edgeA.from, edgeB.from);
          dsu.union(edgeA.to, edgeB.to);
        } else {
          dsu.union(edgeA.from, edgeB.to);
          dsu.union(edgeA.to, edgeB.from);
        }
      }
      const groups = new Map<string, string[]>();
      for (const vertexId of sourceVertices) {
        const root = dsu.find(vertexId);
        const group = groups.get(root);
        if (group) group.push(vertexId);
        else groups.set(root, [vertexId]);
      }
      const out: Record<string, { x: number; y: number }> = {};
      for (const members of groups.values()) {
        const centroid = members.reduce(
          (acc, id) => ({ x: acc.x + (projectedFinal[id]?.x ?? 0), y: acc.y + (projectedFinal[id]?.y ?? 0) }),
          { x: 0, y: 0 }
        );
        const c = { x: centroid.x / members.length, y: centroid.y / members.length };
        for (const id of members) out[id] = c;
      }
      return out;
    };

    const baseIndex = Math.floor(Math.max(0, Math.min(timelineMax, timelinePosition)));
    const localT = Math.max(0, Math.min(1, timelinePosition - baseIndex));
    const opsA = timelineCompletedOperationCounts[Math.min(baseIndex, timelineCompletedOperationCounts.length - 1)] ?? 0;
    const opsB = timelineCompletedOperationCounts[Math.min(baseIndex + 1, timelineCompletedOperationCounts.length - 1)] ?? opsA;
    const targetsA = partialTargetFor(opsA);
    const targetsB = partialTargetFor(opsB);
    const currentStep = baseIndex < timelineSteps.length ? timelineSteps[baseIndex] : null;
    const activePairEdges = new Set(currentStep?.operations.flatMap((entry) => [entry.relation.edgeA, entry.relation.edgeB]) ?? []);
    const activeStoryStages = torusStoryEnabled ? TORUS_STORY_STAGES : mobiusStoryEnabled ? MOBIUS_STORY_STAGES : null;
    const storyProgress = timelineMax <= 0 ? 0 : Math.max(0, Math.min(1, timelinePosition / Math.max(1, timelineMax)));
    const storyFloat = storyProgress * ((activeStoryStages?.length ?? 2) - 1);
    const storyStageIndex = activeStoryStages
      ? Math.max(0, Math.min(activeStoryStages.length - 1, Math.floor(storyFloat + 1e-6)))
      : 0;
    const storyStage = activeStoryStages?.[storyStageIndex] ?? null;

    const blended = (vertexId: string) => {
      const start = projectedStart[vertexId] ?? { x: 260, y: 180 };
      const targetA = targetsA[vertexId] ?? start;
      const targetB = targetsB[vertexId] ?? targetA;
      const target = {
        x: targetA.x * (1 - localT) + targetB.x * localT,
        y: targetA.y * (1 - localT) + targetB.y * localT,
      };
      return {
        x: start.x * 0.35 + target.x * 0.65,
        y: start.y * 0.35 + target.y * 0.65,
      };
    };

    const projectStoryTorus = (u: number, v: number): { x: number; y: number } => {
      const R = 1.86;
      const r = 0.64;
      const x = (R + r * Math.cos(v)) * Math.cos(u);
      const y = (R + r * Math.cos(v)) * Math.sin(u);
      const z = r * Math.sin(v);
      return {
        x: 260 + x * 56 + z * 24,
        y: 184 - y * 43 + z * 11,
      };
    };

    const projectStoryMobius = (u: number, v: number): { x: number; y: number } => {
      const R = 1.72;
      const x = (R + v * Math.cos(u * 0.5)) * Math.cos(u);
      const y = (R + v * Math.cos(u * 0.5)) * Math.sin(u);
      const z = v * Math.sin(u * 0.5);
      return {
        x: 260 + x * 58 + z * 24,
        y: 184 - y * 41 + z * 13,
      };
    };

    const sampledLoop = (builder: (t: number) => { x: number; y: number }, steps: number): string =>
      Array.from({ length: steps + 1 }, (_, index) => {
        const t = index / steps;
        const p = builder(t);
        return `${p.x},${p.y}`;
      }).join(" ");

    const pointsToPath = (points: Array<{ x: number; y: number }>): string =>
      points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

    const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
    const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
    const remap01 = (value: number, start: number, end: number): number =>
      clamp01((value - start) / Math.max(1e-6, end - start));
    const smoothStep01 = (value: number): number => {
      const t = clamp01(value);
      return t * t * (3 - 2 * t);
    };
    const easeOutQuint = (value: number): number => {
      const t = clamp01(value);
      return 1 - Math.pow(1 - t, 5);
    };
    const easeInOutSine = (value: number): number => {
      const t = clamp01(value);
      return 0.5 - 0.5 * Math.cos(Math.PI * t);
    };
    const bell = (x: number, center: number, halfWidth: number): number => {
      const n = clamp01(1 - Math.abs(x - center) / Math.max(1e-6, halfWidth));
      return n * n;
    };

    const tSquareToCylinder = easeOutQuint(remap01(storyFloat, -0.02, 1.18));
    const tCylinderToTorus = easeInOutSine(remap01(storyFloat, 1.7, 4.62));
    const tFinalize = smoothStep01(remap01(storyFloat, 4.48, 5.0));
    const tBGlue = bell(storyFloat, 3.35, 1.0) * easeInOutSine(remap01(storyFloat, 2.2, 4.7));
    const tMobiusBend = easeOutQuint(remap01(storyFloat, 0.1, 2.25));
    const tMobiusTwist = easeInOutSine(remap01(storyFloat, 1.6, 4.2));
    const tMobiusGlue = easeInOutSine(remap01(storyFloat, 3.4, 5.5));
    const tMobiusOverlay = smoothStep01(remap01(storyFloat, 5.0, 6.0));
    const storyRealization =
      mobiusStoryEnabled
        ? result.realizations.find((entry) => entry.id.endsWith("/realization/mobius-smooth")) ?? realization
        : torusStoryEnabled
          ? result.realizations.find((entry) => entry.id.endsWith("/realization/torus-smooth")) ?? realization
          : realization;
    const storyQuotientEdgeLabelById = new Map(result.quotient.edges.map((edge) => [edge.id, edge.label]));
    const storyEdgeColorOverrides = {
      ...(showEdgeClasses
        ? Object.fromEntries(
            Object.keys(storyRealization.edgeCurves)
              .map((edgeId) => {
                if (edgeId === "cut_u") return [edgeId, EDGE_CLASS_COLOR_A] as const;
                if (edgeId === "cut_v") return [edgeId, EDGE_CLASS_COLOR_B] as const;
                const label = storyQuotientEdgeLabelById.get(edgeId);
                const color = edgeColorForLabel(label, "");
                return color ? ([edgeId, color] as const) : null;
              })
              .filter((entry): entry is readonly [string, string] => !!entry)
          )
        : {}),
      ...(showBoundaryLoop ? { mobius_boundary: "#0ea5e9" } : {}),
      ...(showCoreCircle ? { mobius_core: "#f97316" } : {}),
      ...(showOrientationFlip ? { mobius_orient_track: "#9333ea" } : {}),
    };

    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setTimelinePlaying((v) => !v)}
            disabled={timelineOperations.length === 0}
          >
            {timelinePlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelinePlaying(false);
              setTimelinePosition((v) => Math.max(0, Math.floor(v) - 1));
            }}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelinePlaying(false);
              setTimelinePosition((v) => Math.min(timelineMax, Math.floor(v) + 1));
            }}
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => {
              setTimelinePlaying(false);
              setTimelinePosition(0);
            }}
          >
            Reset
          </button>
          <input
            type="range"
            min={0}
            max={timelineMax}
            step={0.01}
            value={timelinePosition}
            onChange={(event) => {
              setTimelinePlaying(false);
              setTimelinePosition(Number(event.target.value));
            }}
            style={{ flex: 1 }}
          />
          <strong style={{ fontSize: 12 }}>
            {activeStoryStages && storyStage
              ? `Stage ${storyStageIndex + 1}/${activeStoryStages.length}`
              : `Step ${Math.min(timelineMax, Math.floor(timelinePosition))}/${timelineMax}`}
          </strong>
          {activeStoryStages && (
            <div style={{ display: "inline-flex", gap: 5, marginLeft: 6 }}>
              <button
                type="button"
                onClick={() => setStoryRenderMode("explain2d")}
                style={{
                  borderRadius: 999,
                  border: "1px solid " + (storyRenderMode === "explain2d" ? "#0a66c2" : "#d1d5db"),
                  background: storyRenderMode === "explain2d" ? "#e6f0ff" : "#fff",
                  fontSize: 10,
                  fontWeight: storyRenderMode === "explain2d" ? 700 : 600,
                  padding: "4px 8px",
                }}
              >
                Explanatory
              </button>
              <button
                type="button"
                onClick={() => setStoryRenderMode("real3d")}
                style={{
                  borderRadius: 999,
                  border: "1px solid " + (storyRenderMode === "real3d" ? "#0a66c2" : "#d1d5db"),
                  background: storyRenderMode === "real3d" ? "#e6f0ff" : "#fff",
                  fontSize: 10,
                  fontWeight: storyRenderMode === "real3d" ? 700 : 600,
                  padding: "4px 8px",
                }}
              >
                Real 3D
              </button>
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#334155" }}>
          {activeStoryStages && storyStage
            ? `${storyStage.label} - ${storyStage.detail}`
            : currentStep
              ? `Step ${baseIndex + 1} [${currentStep.groupId}]: ${currentStep.operations
                  .map((entry) => `${entry.relation.edgeA} ~ ${entry.relation.edgeB} (${entry.relation.relation})`)
                  .join("; ")}`
              : baseIndex <= 0
                ? "Start with flat fundamental diagram."
                : "All grouped operations complete; settle on quotient placement."}
        </div>
        {!activeStoryStages && projectiveStoryEnabled && (
          <div
            style={{
              border: "1px solid #fdba74",
              background: "#fff7ed",
              color: "#9a3412",
              borderRadius: 8,
              padding: "6px 8px",
              fontSize: 11,
              display: "grid",
              gap: 2,
            }}
          >
            <div>Immersed realization of RP^2 in R^3 (cross-cap style).</div>
            <div>Topological type: closed, non-orientable surface (no boundary).</div>
            <div>RP^2 cannot be embedded in R^3 without self-intersection.</div>
            <div>Self-intersection belongs to the immersion in space, not to the abstract quotient.</div>
            <div>This is not a torus.</div>
          </div>
        )}
        {activeStoryStages && storyStage && (
          <div style={{ display: "grid", gap: 5 }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>Current stage: {storyStage.label}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {activeStoryStages.map((stage, index) => {
                const active = index === storyStageIndex;
                const done = index < storyStageIndex;
                return (
                  <div
                    key={`story-stage-${stage.id}`}
                    style={{
                      border: "1px solid " + (active ? "#0a66c2" : done ? "#bfdbfe" : "#d1d5db"),
                      background: active ? "#e6f0ff" : done ? "#eff6ff" : "#fff",
                      borderRadius: 999,
                      padding: "3px 9px",
                      fontSize: 10,
                      fontWeight: active ? 700 : 600,
                    }}
                  >
                    {stage.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeStoryStages && storyRenderMode === "real3d" ? (
          <TopologyRealization3DView
            realization={storyRealization}
            height={390}
            showSeams={showSeams}
            showSkeleton={showOneSkeleton}
            showSingularityMarkers={showCornerIdentifications}
            edgeColorOverrides={storyEdgeColorOverrides}
            hiddenEdgeIds={[
              ...(showBoundaryLoop ? [] : ["mobius_boundary"]),
              ...(showCoreCircle ? [] : ["mobius_core"]),
              ...(showOrientationFlip ? [] : ["mobius_orient_track", "mobius_orient_normal_start", "mobius_orient_normal_end"]),
            ]}
            orientationFlipOverlay={
              mobiusStoryEnabled && showOrientationFlip
                ? {
                    trackEdgeId: "mobius_orient_track",
                    startNormalEdgeId: "mobius_orient_normal_start",
                    endNormalEdgeId: "mobius_orient_normal_end",
                    speed: 0.12,
                    color: "#9333ea",
                  }
                : null
            }
          />
        ) : torusStoryEnabled ? (
          <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
            {(() => {
              const squareOpacity = 1 - tSquareToCylinder;
              const cylOpacity = 1 - 0.28 * tCylinderToTorus;
              const torusOpacity = tCylinderToTorus;
              const bendProfile = Math.sin(Math.PI * clamp01(tSquareToCylinder)) * (1 - 0.45 * tCylinderToTorus);
              const bendOut = 34 * bendProfile;
              const bendLift = 10 * bendProfile;
              const xLeft = lerp(160, 172, tSquareToCylinder);
              const xRight = lerp(360, 348, tSquareToCylinder);
              const topCylinderY = 110 - 0.6 * bendLift;
              const bottomCylinderY = 252 + 0.6 * bendLift;
              const topCy = lerp(86, lerp(topCylinderY, 184, tCylinderToTorus), tSquareToCylinder);
              const bottomCy = lerp(274, lerp(bottomCylinderY, 184, tCylinderToTorus), tSquareToCylinder);
              const cylRx = 88 - 3 * bendProfile;
              const cylRy = 26 + 6 * bendProfile;
              const rimRx = lerp(100, lerp(cylRx, 142, tCylinderToTorus), tSquareToCylinder);
              const rimRy = lerp(0.01, lerp(cylRy, 84, tCylinderToTorus), tSquareToCylinder);
              const sideTop = topCy + rimRy * 0.08 - bendLift * 0.22;
              const sideBottom = bottomCy - rimRy * 0.08 + bendLift * 0.22;
              const sideMidY = (sideTop + sideBottom) / 2;
              const sideLeftX = lerp(xLeft, 198, tCylinderToTorus);
              const sideRightX = lerp(xRight, 322, tCylinderToTorus);
              const leftSidePath = `M ${sideLeftX} ${sideTop} Q ${sideLeftX - bendOut} ${sideMidY} ${sideLeftX} ${sideBottom}`;
              const rightSidePath = `M ${sideRightX} ${sideTop} Q ${sideRightX + bendOut} ${sideMidY} ${sideRightX} ${sideBottom}`;
              const innerRx = lerp(88, 62, tCylinderToTorus);
              const innerRy = lerp(28, 36, tCylinderToTorus);
              const outerStroke = lerp(2.2, 1.7, tCylinderToTorus);
              const bStroke = lerp(2.8, 3.4 + 1.4 * tBGlue, tSquareToCylinder);
              const aStroke = lerp(2.8, 3.2, tSquareToCylinder);
              const topRimDash = tBGlue > 0.2 ? "8 4" : undefined;
              const bottomRimDash = tBGlue > 0.2 ? "8 4" : undefined;
              const aLoopOpacity = clamp01(0.12 + 0.88 * torusOpacity);
              const bLoopOpacity = clamp01(0.1 + 0.9 * smoothStep01((storyFloat - 2.4) / 1.8));
              const finalDash = tFinalize >= 0.96 ? undefined : "7 4";
              const corner = projectStoryTorus(0, 0);

              return (
                <>
                  <rect
                    x={xLeft}
                    y={Math.min(topCy, bottomCy)}
                    width={Math.max(1, xRight - xLeft)}
                    height={Math.max(1, Math.abs(bottomCy - topCy))}
                    fill="#f8fbff"
                    opacity={0.24 * squareOpacity + 0.12 * cylOpacity}
                    stroke="#cbd5e1"
                    strokeWidth={1.2}
                    rx={8 * tSquareToCylinder}
                    ry={8 * tSquareToCylinder}
                  />

                  <ellipse
                    cx={260}
                    cy={topCy}
                    rx={rimRx}
                    ry={rimRy}
                    fill="#eef2ff"
                    opacity={0.2 + 0.55 * cylOpacity}
                    stroke={EDGE_CLASS_COLOR_B}
                    strokeWidth={bStroke}
                    strokeDasharray={topRimDash}
                  />
                  <ellipse
                    cx={260}
                    cy={bottomCy}
                    rx={rimRx}
                    ry={rimRy}
                    fill="#eef2ff"
                    opacity={clamp01(0.14 + 0.52 * cylOpacity - 0.45 * tCylinderToTorus)}
                    stroke={EDGE_CLASS_COLOR_B}
                    strokeWidth={bStroke}
                    strokeDasharray={bottomRimDash}
                  />

                  <path
                    d={leftSidePath}
                    fill="none"
                    stroke={EDGE_CLASS_COLOR_A}
                    strokeWidth={aStroke}
                    opacity={clamp01(1 - 0.92 * tCylinderToTorus)}
                  />
                  <path
                    d={rightSidePath}
                    fill="none"
                    stroke={EDGE_CLASS_COLOR_A}
                    strokeWidth={aStroke}
                    opacity={clamp01(1 - 0.92 * tCylinderToTorus)}
                  />

                  <ellipse cx={260} cy={184} rx={142} ry={84} fill="#dbeafe" opacity={0.62 * torusOpacity} />
                  <ellipse cx={260} cy={184} rx={innerRx} ry={innerRy} fill="#fff" opacity={0.94 * torusOpacity} />
                  <ellipse
                    cx={260}
                    cy={184}
                    rx={142}
                    ry={84}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={outerStroke}
                    opacity={0.76 * torusOpacity}
                  />
                  <ellipse
                    cx={260}
                    cy={184}
                    rx={innerRx}
                    ry={innerRy}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth={1.4}
                    opacity={0.8 * torusOpacity}
                  />

                  <polyline
                    points={sampledLoop((t) => projectStoryTorus(Math.PI * 2 * t, 0), 140)}
                    fill="none"
                    stroke={EDGE_CLASS_COLOR_A}
                    strokeWidth={3.2}
                    strokeDasharray={finalDash}
                    opacity={aLoopOpacity}
                  />
                  <polyline
                    points={sampledLoop((t) => projectStoryTorus(0, Math.PI * 2 * t), 140)}
                    fill="none"
                    stroke={EDGE_CLASS_COLOR_B}
                    strokeWidth={3.2}
                    strokeDasharray={finalDash}
                    opacity={bLoopOpacity}
                  />

                  <g opacity={tFinalize}>
                    <circle cx={corner.x} cy={corner.y} r={6.5} fill="none" stroke="#b45309" strokeWidth={2} />
                    <circle cx={corner.x} cy={corner.y} r={3.6} fill="#b45309" />
                    <text x={corner.x + 10} y={corner.y - 8} style={{ fontSize: 10, fill: "#92400e", fontWeight: 700 }}>
                      corner class
                    </text>
                  </g>

                  <text x={260} y={56} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#334155" }}>
                    {"Square -> Cylinder -> Torus transition"}
                  </text>
                  <text
                    x={260}
                    y={74}
                    textAnchor="middle"
                    style={{ fontSize: 10, fill: "#475569", opacity: clamp01(0.4 + 0.6 * tCylinderToTorus) }}
                  >
                    a-gluing forms cylinder, then b-gluing closes to torus
                  </text>
                  <text
                    x={260}
                    y={90}
                    textAnchor="middle"
                    style={{ fontSize: 9, fill: "#64748b", opacity: clamp01(0.35 + 0.65 * tSquareToCylinder) }}
                  >
                    timing: fast fold, slower closure, physical bend easing
                  </text>
                </>
              );
            })()}
          </svg>
        ) : mobiusStoryEnabled ? (
          <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
            {(() => {
              const xL = 156;
              const xR = 364;
              const yT = 104;
              const yB = 258;
              const bendAmp = 26 * tMobiusBend;
              const stripHalfWidth = lerp(42, 34, tMobiusTwist);
              const stripSteps = 84;
              const topPoints: Array<{ x: number; y: number }> = [];
              const bottomPoints: Array<{ x: number; y: number }> = [];
              const centerPoints: Array<{ x: number; y: number }> = [];

              for (let i = 0; i <= stripSteps; i += 1) {
                const s = i / stripSteps;
                const xFlat = lerp(xL, xR, s);
                const yFlat = lerp(yT + stripHalfWidth, yB - stripHalfWidth, 0.5) + bendAmp * Math.sin(Math.PI * s);
                const theta = Math.PI * tMobiusTwist * s;
                const nx = -Math.sin(theta);
                const ny = Math.cos(theta);
                const topFlat = { x: xFlat + nx * stripHalfWidth, y: yFlat + ny * stripHalfWidth };
                const bottomFlat = { x: xFlat - nx * stripHalfWidth, y: yFlat - ny * stripHalfWidth };
                const u = s * Math.PI * 2;
                const topMobius = projectStoryMobius(u, 0.44);
                const bottomMobius = projectStoryMobius(u, -0.44);
                const centerMobius = projectStoryMobius(u, 0);
                topPoints.push({
                  x: lerp(topFlat.x, topMobius.x, tMobiusGlue),
                  y: lerp(topFlat.y, topMobius.y, tMobiusGlue),
                });
                bottomPoints.push({
                  x: lerp(bottomFlat.x, bottomMobius.x, tMobiusGlue),
                  y: lerp(bottomFlat.y, bottomMobius.y, tMobiusGlue),
                });
                centerPoints.push({
                  x: lerp((topFlat.x + bottomFlat.x) * 0.5, centerMobius.x, tMobiusGlue),
                  y: lerp((topFlat.y + bottomFlat.y) * 0.5, centerMobius.y, tMobiusGlue),
                });
              }

              const boundaryLoop = [...topPoints, ...[...bottomPoints].reverse(), topPoints[0]];
              const boundaryPath = pointsToPath(boundaryLoop);
              const corePath = pointsToPath(centerPoints);
              const leftJoin = {
                a: topPoints[0],
                b: bottomPoints[0],
              };
              const rightJoin = {
                a: topPoints[topPoints.length - 1],
                b: bottomPoints[bottomPoints.length - 1],
              };
              const orientStart = projectStoryMobius(0, 0);
              const orientEnd = projectStoryMobius(Math.PI * 2, 0);
              const orientStartTip = projectStoryMobius(0, 0.24);
              const orientEndTip = projectStoryMobius(Math.PI * 2, -0.24);
              const boundaryOpacity = clamp01(0.35 + 0.65 * tMobiusGlue);
              const coreOpacity = clamp01(0.15 + 0.85 * tMobiusOverlay);
              const orientOpacity = clamp01(0.05 + 0.95 * tMobiusOverlay);

              return (
                <>
                  <rect
                    x={xL}
                    y={yT}
                    width={xR - xL}
                    height={yB - yT}
                    fill="#f8fbff"
                    stroke="#cbd5e1"
                    strokeWidth={1.2}
                    opacity={clamp01(1 - tMobiusGlue)}
                  />
                  <line x1={xL} y1={yT} x2={xR} y2={yT} stroke="#0ea5e9" strokeWidth={2.4} opacity={clamp01(0.4 + 0.6 * (1 - tMobiusGlue))} />
                  <line x1={xL} y1={yB} x2={xR} y2={yB} stroke="#0ea5e9" strokeWidth={2.4} opacity={clamp01(0.4 + 0.6 * (1 - tMobiusGlue))} />
                  <line x1={xL} y1={yT} x2={xL} y2={yB} stroke={EDGE_CLASS_COLOR_A} strokeWidth={2.8 + 1.1 * tMobiusTwist} />
                  <line x1={xR} y1={yT} x2={xR} y2={yB} stroke={EDGE_CLASS_COLOR_A} strokeWidth={2.8 + 1.1 * tMobiusTwist} />

                  <path d={boundaryPath} fill="#dcfce7" opacity={0.52 + 0.34 * tMobiusGlue} stroke="#86efac" strokeWidth={1.1} />
                  <line
                    x1={leftJoin.a.x}
                    y1={leftJoin.a.y}
                    x2={leftJoin.b.x}
                    y2={leftJoin.b.y}
                    stroke={EDGE_CLASS_COLOR_A}
                    strokeWidth={2.4}
                    opacity={clamp01(1 - tMobiusGlue)}
                  />
                  <line
                    x1={rightJoin.a.x}
                    y1={rightJoin.a.y}
                    x2={rightJoin.b.x}
                    y2={rightJoin.b.y}
                    stroke={EDGE_CLASS_COLOR_A}
                    strokeWidth={2.4}
                    opacity={clamp01(1 - tMobiusGlue)}
                  />

                  <path d={boundaryPath} fill="none" stroke="#0ea5e9" strokeWidth={3} opacity={boundaryOpacity} />
                  <path d={corePath} fill="none" stroke="#f97316" strokeWidth={2.5} opacity={coreOpacity} strokeDasharray={tMobiusOverlay > 0.96 ? undefined : "6 3"} />
                  <line
                    x1={orientStart.x}
                    y1={orientStart.y}
                    x2={orientStartTip.x}
                    y2={orientStartTip.y}
                    stroke="#16a34a"
                    strokeWidth={2.1}
                    opacity={orientOpacity}
                  />
                  <line
                    x1={orientEnd.x}
                    y1={orientEnd.y}
                    x2={orientEndTip.x}
                    y2={orientEndTip.y}
                    stroke="#dc2626"
                    strokeWidth={2.1}
                    opacity={orientOpacity}
                  />

                  <text x={260} y={54} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: "#334155" }}>
                    {"Rectangle -> half-twist -> Möbius band"}
                  </text>
                  <text
                    x={260}
                    y={72}
                    textAnchor="middle"
                    style={{ fontSize: 10, fill: "#475569", opacity: clamp01(0.45 + 0.55 * tMobiusGlue) }}
                  >
                    one reversed gluing pair, one boundary loop, one core circle
                  </text>
                </>
              );
            })()}
          </svg>
        ) : (
          <svg width="100%" viewBox="0 0 520 360" style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#fff" }}>
            {diagram.edges.map((edge) => {
              const from = blended(edge.from);
              const to = blended(edge.to);
              const activePair = activePairEdges.has(edge.id);
              const completed = timelineOperations.some(
                (operation, index) => index < opsA && (operation.relation.edgeA === edge.id || operation.relation.edgeB === edge.id)
              );
              const baseColor = edgeColorForLabel(diagram.edgeLabels[edge.id], "#64748b");
              const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
              return (
                <g key={`anim-edge-${edge.id}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={activePair ? "#b91c1c" : baseColor}
                    strokeWidth={activePair ? 3.2 : completed ? 2.5 : 1.8}
                    strokeDasharray={activePair ? "6 3" : undefined}
                    opacity={completed || activePair ? 1 : 0.8}
                  />
                  <text x={mid.x + 5} y={mid.y - 5} style={{ fontSize: 10, fill: activePair ? "#b91c1c" : baseColor }}>
                    {diagram.edgeLabels[edge.id] || edge.id}
                  </text>
                </g>
              );
            })}

            {diagram.vertices.map((vertex) => {
              const point = blended(vertex.id);
              return (
                <g key={`anim-vertex-${vertex.id}`}>
                  <circle cx={point.x} cy={point.y} r={4.8} fill="#0f172a" />
                  <text x={point.x + 7} y={point.y - 7} style={{ fontSize: 10, fill: "#0f172a" }}>
                    {diagram.vertexLabels[vertex.id] || vertex.id}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 8 }}>
          <div
            style={{
              border: "1px solid #dbe4f0",
              borderRadius: 8,
              background: "#fff",
              padding: "8px 10px",
              display: "grid",
              gap: 4,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700 }}>Timeline steps</div>
            <div style={{ fontSize: 10, color: "#475569" }}>Play/scrub by step groups; each step can contain multiple pair operations.</div>
            {timelineSteps.map((step, index) => {
              const active = index === baseIndex;
              const done = index < baseIndex;
              const opSummary = step.operations.map((entry) => entry.label).join("; ");
              return (
                <div
                  key={`timeline-step-${step.id}`}
                  style={{
                    border: "1px solid " + (active ? "#fda4af" : done ? "#bfdbfe" : "#e2e8f0"),
                    borderRadius: 6,
                    background: active ? "#fff1f2" : done ? "#eff6ff" : "#f8fafc",
                    padding: "4px 6px",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setTimelinePlaying(false);
                    setTimelinePosition(index);
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {index + 1}. Group {step.groupId} ({step.operations.length})
                  </div>
                  <div>{opSummary || "(empty step)"}</div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              border: "1px solid #dbe4f0",
              borderRadius: 8,
              background: "#fff",
              padding: "8px 10px",
              display: "grid",
              gap: 6,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700 }}>Operation generator</div>
            <div style={{ fontSize: 10, color: "#475569" }}>Reorder operations and assign group ids; same group id executes in one step.</div>
            {timelineOperations.map((operation, index) => {
              const groupId = normalizedAnimationPlan.groups[operation.id] || operation.id;
              const isTop = index === 0;
              const isBottom = index === timelineOperations.length - 1;
              return (
                <div
                  key={`generator-op-${operation.id}`}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    padding: "5px 6px",
                    display: "grid",
                    gap: 4,
                    fontSize: 10,
                  }}
                >
                  <div>{index + 1}. {operation.label}</div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={isTop}
                      onClick={() => setAnimationPlan((prev) => moveOperationInPlan(buildResult.orientationRelations, prev, operation.id, -1))}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      disabled={isBottom}
                      onClick={() => setAnimationPlan((prev) => moveOperationInPlan(buildResult.orientationRelations, prev, operation.id, 1))}
                    >
                      Down
                    </button>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                      Group
                      <input
                        type="text"
                        value={groupId}
                        onChange={(event) =>
                          setAnimationPlan((prev) =>
                            setOperationGroupInPlan(buildResult.orientationRelations, prev, operation.id, event.target.value)
                          )
                        }
                        style={{ width: 76, fontSize: 10 }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ border: "1px solid #dbe4f0", borderRadius: 8, background: "#fff", padding: "8px 10px", display: "grid", gap: 4, maxHeight: 160, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>Ordered operations</div>
          {timelineOperations.map((operation, index) => {
            const active = index >= opsA && index < opsB;
            const done = index < opsA;
            return (
              <div
                key={`timeline-op-${operation.id}`}
                style={{
                  border: "1px solid " + (active ? "#fda4af" : done ? "#bfdbfe" : "#e2e8f0"),
                  borderRadius: 6,
                  background: active ? "#fff1f2" : done ? "#eff6ff" : "#f8fafc",
                  padding: "4px 6px",
                  fontSize: 10,
                }}
              >
                {index + 1}. [{operation.groupId}] {operation.label}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCenterView = () => {
    if (activeView === "diagram") return renderDiagramView();
    if (activeView === "quotient") return renderQuotientView();
    if (activeView === "realization") return renderRealizationView();
    return renderAnimationView();
  };

  const derivedTopologyHints = useMemo(() => {
    if (torusStoryEnabled) {
      return {
        boundaryComponents: 0,
        orientable: true,
        connectedComponents: 1,
        eulerCharacteristic: 0,
      };
    }
    if (mobiusStoryEnabled) {
      return {
        boundaryComponents: 1,
        orientable: false,
        connectedComponents: 1,
        eulerCharacteristic: 0,
      };
    }
    if (projectiveStoryEnabled) {
      return {
        boundaryComponents: 0,
        orientable: false,
        connectedComponents: 1,
        eulerCharacteristic: 1,
      };
    }
    return {
      boundaryComponents: null as number | null,
      orientable: null as boolean | null,
      connectedComponents: null as number | null,
      eulerCharacteristic: null as number | null,
    };
  }, [mobiusStoryEnabled, projectiveStoryEnabled, torusStoryEnabled]);
  const warningDiagnostics = buildResult.warnings.filter((warning) => warning.level !== "info");
  const infoDiagnostics = buildResult.warnings.filter((warning) => warning.level === "info");

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", alignItems: "stretch", gap: 10 }}>
      <div style={{ ...styles.panelLeft, width: 340, display: "grid", gap: 10 }}>
        <section>
          <h2 style={styles.h2}>Topology Module</h2>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
            Pipeline: Fundamental Diagram - Subdivision/Triangulation - Equivalence - Quotient Complex - Realization - Render.
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => setBuildMode("preset")} style={{ fontWeight: buildMode === "preset" ? 700 : 500 }}>
              Preset mode
            </button>
            <button type="button" onClick={() => setBuildMode("editor")} style={{ fontWeight: buildMode === "editor" ? 700 : 500 }}>
              Editor mode
            </button>
          </div>
          {buildMode === "preset" && (
            <div style={{ display: "grid", gap: 6, maxHeight: 240, overflowY: "auto", paddingRight: 2 }}>
              {TOPOLOGY_PRESETS.map((preset) => {
                const selected = preset.id === presetId;
                return (
                  <button
                    key={`topology-preset-${preset.id}`}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    style={{
                      textAlign: "left",
                      border: "1px solid " + (selected ? "#0a66c2" : "#dbe4f0"),
                      borderRadius: 8,
                      background: selected ? "#e6f0ff" : "#fff",
                      padding: "7px 8px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{preset.label}</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>{preset.summary}</div>
                  </button>
                );
              })}
            </div>
          )}
          {buildMode === "editor" && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Edge editor</div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #dbe4f0", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f8fbff" }}>
                      <th style={{ padding: 4, borderBottom: "1px solid #dbe4f0" }}>Edge</th>
                      <th style={{ padding: 4, borderBottom: "1px solid #dbe4f0" }}>Label</th>
                      <th style={{ padding: 4, borderBottom: "1px solid #dbe4f0" }}>Arrow</th>
                      <th style={{ padding: 4, borderBottom: "1px solid #dbe4f0" }}>Pairings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagram.edges.map((edge) => (
                      <tr key={`edge-row-${edge.id}`}>
                        <td style={{ padding: 4, borderBottom: "1px solid #edf2f7" }}>{edge.id}</td>
                        <td style={{ padding: 4, borderBottom: "1px solid #edf2f7" }}>
                          <input
                            type="text"
                            value={diagram.edgeLabels[edge.id] ?? ""}
                            onChange={(event) =>
                              setDiagramAndDraft(
                                cloneAndPatch(diagram, (next) => {
                                  next.edgeLabels[edge.id] = event.target.value;
                                }),
                                { pushHistory: true }
                              )
                            }
                            style={{ width: 48, fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: 4, borderBottom: "1px solid #edf2f7" }}>
                          <select
                            value={diagram.edgeOrientations[edge.id] ?? 1}
                            onChange={(event) =>
                              setDiagramAndDraft(
                                cloneAndPatch(diagram, (next) => {
                                  next.edgeOrientations[edge.id] = Number(event.target.value) >= 0 ? 1 : -1;
                                }),
                                { pushHistory: true }
                              )
                            }
                            style={{ width: 64, fontSize: 11 }}
                          >
                            <option value={1}>{`->`}</option>
                            <option value={-1}>{`<-`}</option>
                          </select>
                        </td>
                        <td style={{ padding: 4, borderBottom: "1px solid #edf2f7" }}>
                          <input
                            type="text"
                            value={(diagram.edgePairings[edge.id] ?? []).join(",")}
                            onChange={(event) =>
                              setDiagramAndDraft(
                                cloneAndPatch(diagram, (next) => {
                                  next.edgePairings[edge.id] = parsePairings(event.target.value);
                                }),
                                { pushHistory: true }
                              )
                            }
                            style={{ width: "100%", fontSize: 11 }}
                            placeholder="e1,e2"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details>
                <summary style={{ cursor: "pointer", fontSize: 11 }}>Raw JSON editor</summary>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  <textarea
                    value={jsonDraft}
                    onChange={(event) => setJsonDraft(event.target.value)}
                    rows={12}
                    style={{ width: "100%", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 11 }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(jsonDraft) as FundamentalDiagram;
                          setDiagramAndDraft(parsed, { pushHistory: true });
                          setJsonError(null);
                        } catch (error) {
                          setJsonError(String((error as Error).message ?? error));
                        }
                      }}
                    >
                      Apply JSON
                    </button>
                    <button type="button" onClick={() => setJsonDraft(JSON.stringify(diagram, null, 2))}>
                      Reset draft
                    </button>
                  </div>
                  {jsonError && <div style={{ color: "#b42318", fontSize: 11 }}>{jsonError}</div>}
                </div>
              </details>
            </div>
          )}
        </section>

        <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button type="button" onClick={handleBuild}>
              Build Quotient
            </button>
            <button
              type="button"
              onClick={() => {
                ensureBuilt();
                setActiveView("quotient");
              }}
            >
              Show Skeleton
            </button>
            <button
              type="button"
              onClick={() => {
                ensureBuilt();
                setActiveView("realization");
              }}
            >
              Show Realization
            </button>
            <button
              type="button"
              onClick={() => {
                ensureBuilt();
                setActiveView("animation");
              }}
            >
              Animate Identification
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: buildStale ? "#b45309" : "#475569" }}>
            {buildStale ? "Diagram changed. Rebuild to refresh quotient + realization." : "Quotient is up to date."}
          </div>
        </section>

        <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>Topology document</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button type="button" onClick={() => void saveTopologyDocument(false)}>
              Save .math3d-topology
            </button>
            <button type="button" onClick={() => void saveTopologyDocument(true)}>
              Save As...
            </button>
            <button type="button" onClick={() => void loadTopologyDocument()}>
              Load .math3d-topology
            </button>
            <button type="button" onClick={handleRedo} disabled={redoStack.length === 0}>
              Redo
            </button>
          </div>
          <div style={{ fontSize: 10, color: "#475569" }}>
            Stores diagram + quotient cache + realization choices + operation plan.
          </div>
          <div style={{ fontSize: 10, color: dirty ? "#b45309" : "#166534" }}>{dirty ? "Unsaved changes." : "Saved."}</div>
          {currentDocumentPath && <div style={{ fontSize: 10, color: "#475569" }}>Path: {currentDocumentPath}</div>}
          {docStatus && <div style={{ fontSize: 10, color: "#166534" }}>{docStatus}</div>}
          {docError && <div style={{ fontSize: 10, color: "#b42318" }}>{docError}</div>}
        </section>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0,1fr)" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          {([
            ["diagram", "Diagram View"],
            ["quotient", "Quotient Structure View"],
            ["realization", "Realization View"],
            ["animation", "Animation View"],
          ] as const).map(([id, label]) => (
            <button
              key={`topology-view-${id}`}
              type="button"
              onClick={() => {
                if (id !== "diagram") ensureBuilt();
                setActiveView(id);
              }}
              style={{
                borderRadius: 999,
                border: "1px solid " + (activeView === id ? "#0a66c2" : "#d1d5db"),
                background: activeView === id ? "#e6f0ff" : "#fff",
                fontWeight: activeView === id ? 700 : 600,
                fontSize: 11,
                padding: "5px 10px",
              }}
            >
              {label}
            </button>
          ))}
          <label style={{ marginLeft: "auto", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
            Realization
            <select
              value={activeRealizationId ?? buildResult.realizations[0]?.id ?? ""}
              onChange={(event) => setActiveRealizationId(event.target.value)}
              style={{ fontSize: 11 }}
            >
              {buildResult.realizations.map((realization) => (
                <option key={`realization-option-${realization.id}`} value={realization.id}>
                  {realization.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ border: "1px solid #dbe4f0", borderRadius: 10, background: "#f8fbff", padding: 10, overflow: "auto" }}>
          {renderCenterView()}
        </div>
      </div>

      <div style={{ ...styles.panelLeft, width: 330, display: "grid", gap: 10 }}>
        <section>
          <h2 style={styles.h2}>Topology Objects</h2>
          <div style={{ fontSize: 11, display: "grid", gap: 4 }}>
            <div>
              <strong>Fundamental Diagram</strong>
            </div>
            <div>
              vertices {diagram.vertices.length}, edges {diagram.edges.length}, faces {diagram.faces.length}
            </div>
            <div>
              <strong>Subdivision stage</strong>
            </div>
            <div>
              {buildResult.subdivision.applied
                ? `triangulated faces ${buildResult.subdivision.triangulatedFaceIds.length}, created edges ${buildResult.subdivision.createdEdgeIds.length}`
                : "no triangulation needed"}
            </div>
            <div>
              <strong>Quotient Complex</strong>
            </div>
            <div>
              vertices {buildResult.quotient.vertices.length}, edges {buildResult.quotient.edges.length}, faces{" "}
              {buildResult.quotient.faces.length}
            </div>
            <div>
              <strong>Realizations</strong>
            </div>
            <div>{buildResult.realizations.length} realization choice(s) loaded</div>
          </div>
        </section>

        <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
          <h2 style={styles.h2}>Pipeline</h2>
          <div style={{ display: "grid", gap: 6 }}>
            {buildResult.pipeline.map((stage) => (
              <div
                key={`stage-${stage.id}`}
                style={{
                  border: "1px solid " + (stage.status === "warning" ? "#fde68a" : "#dbe4f0"),
                  borderRadius: 8,
                  background: stage.status === "warning" ? "#fffbeb" : "#fff",
                  padding: "6px 8px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700 }}>
                  {stage.label} [{stage.status}]
                </div>
                <div style={{ fontSize: 10, color: "#475569" }}>{stage.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
          <h2 style={styles.h2}>Warnings & Invariants</h2>
          <div style={{ fontSize: 11, display: "grid", gap: 4 }}>
            {buildResult.quotient.invariants && (
              <>
                <div>
                  Euler characteristic:{" "}
                  {derivedTopologyHints.eulerCharacteristic ?? buildResult.quotient.invariants.eulerCharacteristic}
                </div>
                <div>
                  Connected components:{" "}
                  {derivedTopologyHints.connectedComponents ?? buildResult.quotient.invariants.connectedComponents}
                </div>
                {derivedTopologyHints.boundaryComponents !== null && (
                  <div>Boundary components: {derivedTopologyHints.boundaryComponents}</div>
                )}
                {derivedTopologyHints.orientable !== null && (
                  <div>Orientable: {derivedTopologyHints.orientable ? "Yes" : "No"}</div>
                )}
                <div>Non-manifold edges: {buildResult.quotient.invariants.nonManifoldEdgeCount}</div>
              </>
            )}
            <div style={{ marginTop: 4, fontWeight: 700 }}>Warnings ({warningDiagnostics.length})</div>
            {warningDiagnostics.length === 0 ? (
              <div style={{ color: "#166534" }}>No warnings.</div>
            ) : (
              <div style={{ display: "grid", gap: 5, maxHeight: 220, overflowY: "auto" }}>
                {warningDiagnostics.map((warning, index) => (
                  <div
                    key={`warning-${warning.code}-${index}`}
                    style={{
                      border: "1px solid " + (warning.level === "error" ? "#fecaca" : warning.level === "warning" ? "#fde68a" : "#dbe4f0"),
                      borderRadius: 7,
                      background: warning.level === "error" ? "#fff1f2" : warning.level === "warning" ? "#fffbeb" : "#f8fafc",
                      padding: "5px 6px",
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700 }}>
                      {warning.level.toUpperCase()} - {warning.code}
                    </div>
                    <div style={{ fontSize: 10 }}>{warning.message}</div>
                  </div>
                ))}
              </div>
            )}
            {infoDiagnostics.length > 0 && (
              <>
                <div style={{ marginTop: 4, fontWeight: 700 }}>Info ({infoDiagnostics.length})</div>
                <div style={{ display: "grid", gap: 5, maxHeight: 160, overflowY: "auto" }}>
                  {infoDiagnostics.map((info, index) => (
                    <div
                      key={`info-${info.code}-${index}`}
                      style={{
                        border: "1px solid #dbe4f0",
                        borderRadius: 7,
                        background: "#f8fafc",
                        padding: "5px 6px",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        [{info.stage}] {info.code}
                      </div>
                      <div>{info.message}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default TopologyScreen;
