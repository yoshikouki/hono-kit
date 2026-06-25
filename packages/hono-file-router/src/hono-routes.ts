import type { HonoRoutesProducer } from "./index";

export interface HonoRoutesOptions {
  name?: string;
}

export function honoRoutes(options: HonoRoutesOptions = {}): HonoRoutesProducer {
  return {
    name: options.name ?? "hono-routes",
  };
}
