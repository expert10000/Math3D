import { createScientificApiServer } from "./server";

const host = process.env.MATH3D_SCIENTIFIC_API_HOST ?? "127.0.0.1";
const port = Number(process.env.MATH3D_SCIENTIFIC_API_PORT ?? 8772);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new RangeError("Invalid scientific API port.");
createScientificApiServer().listen(port, host, () =>
  console.log(`[scientific-api] listening on http://${host}:${port}`));
