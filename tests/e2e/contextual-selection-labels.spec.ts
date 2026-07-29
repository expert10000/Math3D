import { expect, test } from "@playwright/test";
import { contextualSelectionLabelPatterns } from "./helpers/contextualSelectionLabels";

test.describe("contextual selection label patterns", () => {
  test("accept face and edge selection labels with or without punctuation", () => {
    expect("Selected face 9").toMatch(contextualSelectionLabelPatterns.face);
    expect("Selected face: 9").toMatch(contextualSelectionLabelPatterns.face);
    expect("Selected edge 5-6").toMatch(contextualSelectionLabelPatterns.edge);
    expect("Selected edge: 5-6").toMatch(contextualSelectionLabelPatterns.edge);
  });
});
