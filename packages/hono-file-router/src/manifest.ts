import type { Env } from "hono";
import type {
  FileRoute,
  FileRouteRenderer,
  GlobValue,
  HonoRoute,
  ManifestGeneratedRoute,
  RendererSource,
  RouteManifest,
  RouteManifestConfig,
  RouteSource,
} from "./types";
import { validatedHonoApp } from "./hono-route";
import {
  assertNoRegistrationCollisions,
  type CollisionRegistration,
} from "./registration-plan";
import {
  honoFilePathConvention,
  hasDynamicRouteSegments,
  routeFileToManifestPath,
  sortRoutesBySpecificity,
} from "./route-path";

function toLoader<TModule>(value: GlobValue<TModule>): () => Promise<TModule> {
  return async () => {
    if (typeof value === "function") {
      return (await (value as () => TModule | Promise<TModule>)()) as TModule;
    }
    return value;
  };
}

function assertDynamicRoutePolicy(
  path: string,
  file: string,
  dynamicRoutes: boolean
): void {
  if (!dynamicRoutes && hasDynamicRouteSegments(path)) {
    throw new Error(
      `Dynamic route "${path}" from ${file} is disabled for this source.`
    );
  }
}

function routeId(prefix: string, file: string): string {
  return `${prefix}:${file}`;
}

function isRendererSource<
  E extends Env,
  TModule,
  TData,
>(
  source: RouteSource<E, TModule, TData>
): source is RendererSource<E, TModule, TData> {
  return "renderer" in source;
}

function isIgnoredRouteFile<
  E extends Env,
  TModule,
  TData,
>(
  file: string,
  source: RouteSource<E, TModule, TData>,
  convention: NonNullable<RouteManifestConfig<E>["pathConvention"]>
): boolean {
  return Boolean(source.ignore?.(file) || convention.ignore?.(file));
}

export function createRouteManifest<
  E extends Env = Env,
>(
  config: RouteManifestConfig<E>
): RouteManifest<E> {
  const sources = Array.isArray(config.sources)
    ? config.sources
    : [config.sources];
  const pathConvention = config.pathConvention ?? honoFilePathConvention;

  if (sources.length === 0) {
    throw new Error("createRouteManifest requires at least one route source.");
  }

  const generatedRoutes: ManifestGeneratedRoute<E>[] = [];
  const handlers: HonoRoute<E>[] = [];
  const registrations: CollisionRegistration[] = [];
  const renderers: FileRouteRenderer<E>[] = [];
  const routes: FileRoute[] = [];

  for (const source of sources) {
    const dynamicRoutes = source.dynamicRoutes ?? true;
    if (isRendererSource(source)) {
      renderers.push(source.renderer);
    }

    for (const [file, value] of Object.entries(source.files)) {
      if (isIgnoredRouteFile(file, source, pathConvention)) {
        continue;
      }

      const manifestPath = routeFileToManifestPath(file, pathConvention);
      assertDynamicRoutePolicy(manifestPath.path, file, dynamicRoutes);

      if (isRendererSource(source)) {
        const route: FileRoute = {
          file,
          id: routeId(source.renderer.name, file),
          load: toLoader(value),
          path: manifestPath.path,
          rendererName: source.renderer.name,
        };
        if (!source.renderer.accepts(route)) {
          throw new Error(
            `Renderer "${source.renderer.name}" does not accept ${file}.`
          );
        }
        routes.push(route);
        registrations.push({
          kind: "renderer",
          method: "GET",
          path: route.path,
          source: file,
        });

        for (const generatedRoute of source.renderer.generatedRoutes?.(route) ??
          []) {
          registrations.push({
            kind: "generated",
            method: generatedRoute.method ?? "GET",
            path: generatedRoute.path,
            source: `${file} generated route ${generatedRoute.path}`,
          });
          generatedRoutes.push({ ...generatedRoute, owner: route.id });
        }
        continue;
      }

      const handler: HonoRoute<E> = {
        file,
        id: routeId("hono", file),
        module: validatedHonoApp<E>(value, file),
        path: manifestPath.path,
      };
      registrations.push({
        kind: "hono",
        path: handler.path,
        source: file,
      });
      handlers.push(handler);
    }
  }

  assertNoRegistrationCollisions(registrations);
  const sortedHandlers = sortRoutesBySpecificity(handlers);
  const sortedRoutes = sortRoutesBySpecificity(routes);

  return {
    generatedRoutes,
    handlers: sortedHandlers,
    renderers,
    routes: sortedRoutes,
  };
}
