export type InspectorFieldKind = "number" | "toggle" | "select" | "text";

export type InspectorFieldDefinition = {
  id: string;
  label: string;
  kind: InspectorFieldKind;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
};

export type InspectorSectionDefinition = {
  id: string;
  title: string;
  fields: InspectorFieldDefinition[];
};

export type ToolbarActionDefinition = {
  id: string;
  label: string;
  shortcut?: string;
  group?: "file" | "edit" | "view" | "insert" | "analysis";
};

export type PanelDefinition = {
  id: string;
  title: string;
  pinned?: boolean;
  sections: InspectorSectionDefinition[];
};

export const createPanelDefinition = (
  id: string,
  title: string,
  sections: InspectorSectionDefinition[]
): PanelDefinition => ({
  id,
  title,
  sections,
});
