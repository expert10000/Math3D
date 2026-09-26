import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyGraph2DDocument } from "@math3d/core";
import { recommendedWorkspaceDockLayout } from "../workspaceDocks";
import { GraphsWorkspace } from "./GraphsWorkspace";

const document = createEmptyGraph2DDocument("graphs-shell-test");
const dockLayout = recommendedWorkspaceDockLayout("graphs");

describe("Graphs workspace shell", () => {
  it("renders document-backed empty, loading, and error states", () => {
    const empty = renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} />);
    expect(empty).toContain("0 functions");
    expect(empty).toContain("No functions in this graph.");
    expect(renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} status="loading" />))
      .toContain("Loading graph");
    expect(renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} status="error" errorMessage="Invalid source" />))
      .toContain("Invalid source");
  });
});
