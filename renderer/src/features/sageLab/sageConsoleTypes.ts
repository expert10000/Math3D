export type SageConsoleResponse = {
  jobId: string;
  success: boolean;
  backendId: "sage-local-wsl";
  engineVersion?: string;
  stdout: string;
  result: string;
  error?: string;
  warnings: string[];
  inputHash: string;
  elapsedMs: number;
};
