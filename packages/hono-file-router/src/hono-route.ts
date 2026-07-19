import type { Env, Hono } from "hono";
import { HonoBase } from "hono/hono-base";
import type { HonoRouteModule } from "./types";

export function validatedHonoApp<E extends Env>(
  value: unknown,
  file: string
): Hono<E> {
  if (typeof value === "function") {
    throw new Error(
      `Hono route source ${file} must be eager. Use import.meta.glob(..., { eager: true }).`
    );
  }

  const candidate =
    value && typeof value === "object" && "default" in value
      ? (value as HonoRouteModule<E>).default
      : value;

  if (!(candidate instanceof HonoBase)) {
    throw new Error(`Hono route module ${file} must export a Hono app.`);
  }
  if (candidate.routes.length === 0) {
    throw new Error(
      `Hono route module ${file} must define at least one route at "/".`
    );
  }

  const nonRootRoute = candidate.routes.find((route) => route.path !== "/");
  if (nonRootRoute) {
    throw new Error(
      `Hono route module ${file} must only define routes at "/"; found "${nonRootRoute.path}". One file owns one final route path.`
    );
  }

  return candidate as Hono<E>;
}
