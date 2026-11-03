import SageServicesWorkspace, { type SageServicesWorkspaceProps } from "./SageServicesWorkspace";

export default function NumberTheoryWorkspace(props: SageServicesWorkspaceProps) {
  return <SageServicesWorkspace {...props} context="number_theory" title="Number Theory"
    description="Exact greatest common divisors and modular inverses through the shared SageMath service."
    testId="number-theory-workspace" />;
}
