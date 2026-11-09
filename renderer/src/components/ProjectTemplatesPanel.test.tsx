import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { curatedStudy } from "../projects/curatedStudyCatalog";
import { CuratedStudyCard } from "./ProjectTemplatesPanel";

describe("curated Gallery platform actions", () => {
  const noop = () => undefined;
  const common = { hasCopy: false, busy: false, onOpen: noop, onPreview: noop, onNewCopy: noop };

  it("withholds quantum scene import when the desktop verified chooser is absent", () => {
    const item = curatedStudy("quantum-qwz")!;
    const unavailable = renderToStaticMarkup(<CuratedStudyCard {...common} item={item}
      quantumImportAvailable={false} onImportQuantumScene={noop} />);
    expect(unavailable).toContain("Scene import requires the desktop app.");
    expect(unavailable).toMatch(/data-testid="curated-study-import-quantum-qwz" disabled=""/);
    const desktop = renderToStaticMarkup(<CuratedStudyCard {...common} item={item}
      quantumImportAvailable onImportQuantumScene={noop} />);
    expect(desktop).not.toContain("Scene import requires the desktop app.");
    expect(desktop).toContain("Choose verified scene bundle");
    expect(desktop).not.toMatch(/data-testid="curated-study-import-quantum-qwz" disabled=""/);
  });

  it("leaves CAS examples available without a quantum scene chooser", () => {
    const html = renderToStaticMarkup(<CuratedStudyCard {...common} item={curatedStudy("cas-structures")!}
      quantumImportAvailable={false} onOpenCasGallery={noop} />);
    expect(html).toContain("Open CAS examples");
    expect(html).not.toContain("Scene import requires the desktop app.");
  });
});
