import type { Env, Handler, Hono } from "hono";
import { validatedHonoApp } from "./hono-route";
import {
  assertSupportedRoutePath,
  compareRouteSpecificity,
  routePathToShape,
} from "./route-path";
import type {
  FileRoute,
  FileRouteRenderer,
  HttpMethod,
  RouteManifest,
} from "./types";

export interface RendererRegistration<E extends Env> {
  handler: Handler<E>;
  kind: "renderer";
  method: "GET";
  path: string;
  source: string;
}

export interface GeneratedRegistration<E extends Env> {
  handler: Handler<E>;
  kind: "generated";
  method: HttpMethod;
  path: string;
  source: string;
}

export interface HonoRegistration<E extends Env> {
  app: Hono<E>;
  kind: "hono";
  path: string;
  source: string;
}

export type RegistrationPlanEntry<E extends Env> =
  | RendererRegistration<E>
  | GeneratedRegistration<E>
  | HonoRegistration<E>;

export type RegistrationPlan<E extends Env> = readonly RegistrationPlanEntry<E>[];

interface CollisionRegistrationBase {
  path: string;
  source: string;
}

export type CollisionRegistration =
  | (CollisionRegistrationBase & {
      kind: "generated" | "renderer";
      method: HttpMethod;
    })
  | (CollisionRegistrationBase & {
      kind: "hono";
    });

interface CollisionBucket {
  allMethods?: CollisionRegistration;
  methods: Map<HttpMethod, CollisionRegistration>;
  opaque?: CollisionRegistration;
}

const SUPPORTED_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "ALL",
]);

function rendererMap<E extends Env, TModule, TData>(
  renderers: FileRouteRenderer<E, TModule, TData>[]
): Map<string, FileRouteRenderer<E, TModule, TData>> {
  const byName = new Map<string, FileRouteRenderer<E, TModule, TData>>();
  for (const renderer of renderers) {
    if (renderer.name.trim().length === 0) {
      throw new Error("Renderer names must be non-empty.");
    }
    if (byName.has(renderer.name)) {
      throw new Error(`Duplicate renderer name "${renderer.name}".`);
    }
    byName.set(renderer.name, renderer);
  }
  return byName;
}

function resolveRenderer<E extends Env, TModule, TData>(
  route: FileRoute<TModule, TData>,
  renderers: Map<string, FileRouteRenderer<E, TModule, TData>>
): FileRouteRenderer<E, TModule, TData> {
  const renderer = route.rendererName
    ? renderers.get(route.rendererName)
    : undefined;
  if (!renderer) {
    throw new Error(
      `Route "${route.path}" references unknown renderer "${route.rendererName ?? ""}".`
    );
  }
  return renderer;
}

function assertUniqueRouteIds<TModule, TData>(
  routes: FileRoute<TModule, TData>[]
): Map<string, FileRoute<TModule, TData>> {
  const byId = new Map<string, FileRoute<TModule, TData>>();
  for (const route of routes) {
    if (byId.has(route.id)) {
      throw new Error(`Duplicate route id "${route.id}".`);
    }
    byId.set(route.id, route);
  }
  return byId;
}

function assertSupportedMethod(method: unknown, path: string): asserts method is HttpMethod {
  if (typeof method !== "string" || !SUPPORTED_METHODS.has(method as HttpMethod)) {
    throw new Error(`Unsupported generated route method "${String(method)}" for "${path}".`);
  }
}

function firstCollision(
  bucket: CollisionBucket,
  candidate: CollisionRegistration
): CollisionRegistration | undefined {
  if (candidate.kind === "hono") {
    return (
      bucket.opaque ??
      bucket.allMethods ??
      bucket.methods.values().next().value
    );
  }
  if (candidate.method === "ALL") {
    return (
      bucket.opaque ??
      bucket.allMethods ??
      bucket.methods.values().next().value
    );
  }
  return (
    bucket.opaque ?? bucket.allMethods ?? bucket.methods.get(candidate.method)
  );
}

function addToCollisionBucket(
  bucket: CollisionBucket,
  candidate: CollisionRegistration
): void {
  if (candidate.kind === "hono") {
    bucket.opaque = candidate;
  } else if (candidate.method === "ALL") {
    bucket.allMethods = candidate;
  } else {
    bucket.methods.set(candidate.method, candidate);
  }
}

export function assertNoRegistrationCollisions(
  registrations: readonly CollisionRegistration[]
): void {
  const registrationsByShape = new Map<string, CollisionBucket>();

  for (const candidate of registrations) {
    assertSupportedRoutePath(candidate.path);
    const shape = routePathToShape(candidate.path);
    const bucket = registrationsByShape.get(shape) ?? {
      methods: new Map<HttpMethod, CollisionRegistration>(),
    };
    const collision = firstCollision(bucket, candidate);
    if (collision) {
      const method =
        candidate.kind === "hono" ? "opaque Hono methods" : candidate.method;
      throw new Error(
        `Duplicate route shape "${shape}" for ${method}: ${collision.source} (${collision.path}) and ${candidate.source} (${candidate.path})`
      );
    }
    addToCollisionBucket(bucket, candidate);
    registrationsByShape.set(shape, bucket);
  }
}

function registrationMethod<E extends Env>(
  entry: RegistrationPlanEntry<E>
): string {
  return entry.kind === "hono" ? "OPAQUE" : entry.method;
}

function compareRegistrationEntries<E extends Env>(
  a: RegistrationPlanEntry<E>,
  b: RegistrationPlanEntry<E>
): number {
  const pathOrder = compareRouteSpecificity(a.path, b.path);
  if (pathOrder !== 0) {
    return pathOrder;
  }

  const aKey = `${registrationMethod(a)}\0${a.kind}\0${a.source}`;
  const bKey = `${registrationMethod(b)}\0${b.kind}\0${b.source}`;
  if (aKey === bKey) {
    return 0;
  }
  return aKey < bKey ? -1 : 1;
}

export function compileRegistrationPlan<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
>(manifest: RouteManifest<E, TModule, TData>): RegistrationPlan<E> {
  const renderers = rendererMap(manifest.renderers);
  const routesById = assertUniqueRouteIds(manifest.routes);

  const handlerEntries: (RendererRegistration<E> | GeneratedRegistration<E>)[] =
    manifest.routes.map((route) => {
      const renderer = resolveRenderer(route, renderers);
      return {
        handler: (c) => renderer.render({ c, route }),
        kind: "renderer",
        method: "GET",
        path: route.path,
        source: route.file,
      };
    });

  for (const generatedRoute of manifest.generatedRoutes) {
    const owner = routesById.get(generatedRoute.owner);
    if (!owner) {
      throw new Error(
        `Generated route "${generatedRoute.path}" references unknown owner "${generatedRoute.owner}".`
      );
    }
    const method = generatedRoute.method ?? "GET";
    assertSupportedMethod(method, generatedRoute.path);
    const source = `${owner.file} generated route ${generatedRoute.path}`;
    handlerEntries.push({
      handler: (c) => generatedRoute.render({ c, route: owner }),
      kind: "generated",
      method,
      path: generatedRoute.path,
      source,
    });
  }

  const honoEntries: HonoRegistration<E>[] = manifest.handlers.map(
    (route) => ({
      app: validatedHonoApp<E>(route.module, route.file),
      kind: "hono",
      path: route.path,
      source: route.file,
    })
  );

  const entries = [...handlerEntries, ...honoEntries];
  assertNoRegistrationCollisions(entries);

  return [...entries].sort(compareRegistrationEntries);
}

function applyHandlerRegistration<E extends Env>(
  app: Hono<E>,
  entry: RendererRegistration<E> | GeneratedRegistration<E>
): void {
  if (entry.kind === "renderer") {
    app.get(entry.path, entry.handler);
    return;
  }

  if (entry.method === "ALL") {
    app.all(entry.path, entry.handler);
    return;
  }
  app.on(entry.method, entry.path, entry.handler);
}

export function applyRegistrationPlan<E extends Env>(
  app: Hono<E>,
  plan: RegistrationPlan<E>
): Hono<E> {
  for (const entry of plan) {
    if (entry.kind === "hono") {
      app.route(entry.path, entry.app);
    } else {
      applyHandlerRegistration(app, entry);
    }
  }
  return app;
}
