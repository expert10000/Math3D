import { runScientificBenchmark, type BenchmarkId, type BenchmarkResult } from "./scientificBenchmarks";

self.onmessage = (event: MessageEvent<{ id: BenchmarkId }>) => {
  let result: BenchmarkResult;
  try { result = runScientificBenchmark(event.data.id); }
  catch (error) { result = { status: "fail", detail: (error as Error).message }; }
  self.postMessage({ id: event.data.id, result });
};
