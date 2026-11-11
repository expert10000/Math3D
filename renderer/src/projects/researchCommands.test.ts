import { describe, expect, it } from "vitest";
import { createGraph2DDocument, createMixedWorkspaceDocument, instantiateMath3DProjectTemplate,
  replaceMath3DProjectWorkspace, structuralHash } from "@math3d/core";
import { prepareCuratedStudyBundle } from "./curatedStudyProject";
import { buildResearchCommands, searchResearchCommands } from "./researchCommands";

const guided = prepareCuratedStudyBundle({ project: instantiateMath3DProjectTemplate("catenary-study", "commands") },
  "catenary-study", "commands");
const input = () => ({ project: guided.project, savedProjects: [],
  workbookBytes: (id: string) => guided.resources?.bytes({ kind: "workbook-payload", id }) ?? null,
  workbookState: (_id: string): "available" | "missing" | "unverified" => "available",
  canOpenDocument: () => true, canOpenWorkbook: true, canOpenCas: true, preview: false, busy: false });

describe("global research command index", () => {
  it("indexes the exact guided Study path and searches saved citations", () => {
    const commands = buildResearchCommands(input());
    for (const kind of ["gallery", "current-project", "cas", "study", "result", "workbook", "note", "document", "citation"])
      expect(commands.some(command => command.target.kind === kind), kind).toBe(true);
    const citations = searchResearchCommands(commands, "citation catenary");
    expect(citations.length).toBeGreaterThan(0);
    expect(citations.every(command => command.target.kind === "citation")).toBe(true);
    expect(citations[0]?.status).toBe("current");
  });

  it("keeps unavailable commands searchable with specific host and payload reasons", () => {
    const commands = buildResearchCommands({ ...input(), canOpenDocument: () => false,
      canOpenWorkbook: false, workbookState: () => "missing", preview: true });
    expect(commands.find(command => command.target.kind === "document")?.unavailableReason).toMatch(/Open this Project/);
    expect(commands.find(command => command.target.kind === "workbook")?.unavailableReason).toMatch(/editor is unavailable/);
    expect(commands.find(command => command.target.kind === "note")?.unavailableReason).toMatch(/Open this Project/);
    expect(searchResearchCommands(commands, "payload missing").some(command => command.target.kind === "workbook")).toBe(true);
  });

  it("handles an empty Project and unavailable CAS without inventing saved research", () => {
    const commands = buildResearchCommands({ ...input(), project: null, canOpenCas: false });
    expect(commands).toHaveLength(3);
    expect(commands.find(command => command.target.kind === "current-project")?.unavailableReason).toBe("No Project is open.");
    expect(commands.find(command => command.target.kind === "cas")?.unavailableReason).toMatch(/unavailable/);
  });

  it("labels a saved citation historical after its pinned Graph source changes", () => {
    const sourceId = guided.project.workspace.studies![0]!.members[0]!.documentId;
    const entries = guided.project.workspace.entries.map(entry => {
      if (entry.expected.id !== sourceId || entry.checkpoint.format !== "math3d.graph2d-document") return entry;
      const old = entry.checkpoint;
      const source = { ...old.source, objects: old.source.objects.map((object, index) => index === 0 ?
        { ...object, label: `${object.label} revised` } : object) };
      const checkpoint = createGraph2DDocument({ ...old, stableKey: old.identity.id, title: old.metadata.title, source,
        identity: { ...old.identity, revision: old.identity.revision + 1, structuralHash: structuralHash(source) } });
      return { ...entry, checkpoint, expected: checkpoint.identity, replay: null };
    });
    const changed = replaceMath3DProjectWorkspace(guided.project,
      createMixedWorkspaceDocument({ ...guided.project.workspace, entries }));
    const citation = buildResearchCommands({ ...input(), project: changed })
      .find(command => command.target.kind === "citation");
    expect(citation?.status).toBe("historical");
    expect(citation?.detail).toContain("earlier Study");
  });
});
