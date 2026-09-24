import { useState } from "react";

export type MobileTab = "home" | "explore" | "workspace" | "projects" | "settings";
export type ExploreSection = "examples" | "learn";
export type InspectorSection = "scene" | "object" | "create" | "view" | "compute" | "analyze";

export const useMobileNavigationState = () => {
  const [tab, setTab] = useState<MobileTab>("workspace");
  const [exploreSection, setExploreSection] = useState<ExploreSection>("examples");
  const [inspectorSection, setInspectorSection] = useState<InspectorSection>("object");
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  return { tab, setTab, exploreSection, setExploreSection, inspectorSection, setInspectorSection, inspectorExpanded, setInspectorExpanded };
};
