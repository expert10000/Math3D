import { routeCompute } from "../../../apps/web/cloudflare/compute-route.mjs";

export function onRequest(context) {
  return routeCompute(context, "sage-private");
}
