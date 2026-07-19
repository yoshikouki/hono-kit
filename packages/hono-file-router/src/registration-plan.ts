import type { Env, Handler, Hono } from "hono";
import { validatedHonoApp } from "./hono-route";
import { routePathToShape, sortRoutesBySpecificity } from "./route-path";
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

interface StructuralRegistration {
  generated: boolean;
  path: string;
  source: string;
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

function assertNoStructuralCollisions(
  registrations: StructuralRegistration[]
): void {
  const primaryShapes = new Map<string, StructuralRegistration>();
  const registered: StructuralRegistration[] = [];

  for (const candidate of registrations) {
    const collision = candidate.generated
      ? registered.find((entry) => entry.path === candidate.path)
      : registered.find(
          (entry) => entry.generated && entry.path === candidate.path
        ) ?? primaryShapes.get(routePathToShape(candidate.path));
    if (collision) {
      throw new Error(
        `Duplicate route "${candidate.path}": ${collision.source} and ${candidate.source}`
      );
    }

    if (!candidate.generated) {
      primaryShapes.set(routePathToShape(candidate.path), candidate);
    }
    registered.push(candidate);
  }
}

export function compileRegistrationPlan<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
>(manifest: RouteManifest<E, TModule, TData>): RegistrationPlan<E> {
  const renderers = rendererMap(manifest.renderers);
  const routesById = assertUniqueRouteIds(manifest.routes);
  const structuralRegistrations: StructuralRegistration[] = [];

  const handlerEntries: (RendererRegistration<E> | GeneratedRegistration<E>)[] =
    manifest.routes.map((route) => {
      const renderer = resolveRenderer(route, renderers);
      structuralRegistrations.push({
        generated: false,
        path: route.path,
        source: route.file,
      });
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
    structuralRegistrations.push({
      generated: true,
      path: generatedRoute.path,
      source,
    });
    handlerEntries.push({
      handler: (c) => generatedRoute.render({ c, route: owner }),
      kind: "generated",
      method,
      path: generatedRoute.path,
      source,
    });
  }

  const honoEntries: HonoRegistration<E>[] = manifest.handlers.map((route) => {
    structuralRegistrations.push({
      generated: false,
      path: route.path,
      source: route.file,
    });
    return {
      app: validatedHonoApp<E>(route.module, route.file),
      kind: "hono",
      path: route.path,
      source: route.file,
    };
  });

  assertNoStructuralCollisions(structuralRegistrations);

  return [...sortRoutesBySpecificity(handlerEntries), ...honoEntries];
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
