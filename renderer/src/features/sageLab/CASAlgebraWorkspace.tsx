import SageServicesWorkspace, { type SageServicesWorkspaceProps } from "./SageServicesWorkspace";

export default function CASAlgebraWorkspace(props: SageServicesWorkspaceProps & { onOpenConsole: () => void }) {
  return <SageServicesWorkspace {...props} context="cas" title="CAS / Algebra"
    description="Exact symbolic, polynomial, matrix, algebraic geometry, and number theory operations."
    testId="cas-algebra-workspace" />;
}
