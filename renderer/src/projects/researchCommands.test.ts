import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate } from "@math3d/core";
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
});
