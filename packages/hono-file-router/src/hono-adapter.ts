import { Hono } from "hono";
import type { Env } from "hono";
import { createRouteManifest } from "./manifest";
import {
  applyRegistrationPlan,
  compileRegistrationPlan,
} from "./registration-plan";
import type {
  CreateFileRouterOptions,
  MountFileRoutesOptions,
  RouteInput,
  RouteManifest,
} from "./types";

function resolveManifest<E extends Env>(
  input: RouteInput<E>
): RouteManifest<E> {
  if (input.manifest) {
    return input.manifest;
  }

  return createRouteManifest({ sources: input.sources });
}

export function mountFileRoutes<E extends Env = Env>(
  app: Hono<E>,
  options: MountFileRoutesOptions<E>
): Hono<E> {
  const manifest = resolveManifest(options);
  return applyRegistrationPlan(app, compileRegistrationPlan(manifest));
}

export function createFileRouter<E extends Env = Env>(
  options: CreateFileRouterOptions<E>
): Hono<E> {
  const {
    manifest: _manifest,
    sources: _sources,
    ...honoOptions
  } = options;
  const app = new Hono<E>(honoOptions);
  return mountFileRoutes(app, options);
}
