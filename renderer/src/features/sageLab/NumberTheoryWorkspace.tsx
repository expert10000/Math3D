import CASAlgebraWorkspace, { type CASAlgebraWorkspaceProps } from "./CASAlgebraWorkspace";

export default function NumberTheoryWorkspace(props: CASAlgebraWorkspaceProps) {
  return <CASAlgebraWorkspace {...props} workspaceContext="number_theory" />;
}
