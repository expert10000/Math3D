import React from "react";
import { useMobileAppController } from "./mobileAppController";
import { MobileAppView } from "./MobileAppView";

export const MobileApp: React.FC = () => {
  const model = useMobileAppController();
  return <MobileAppView model={model} />;
};
