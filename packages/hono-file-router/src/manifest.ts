import type {
  FileRoute,
  FileRouteRenderer,
  GeneratedRoute,
  GlobValue,
  HonoRoute,
  RendererSource,
  RouteManifest,
  RouteManifestConfig,
  RouteSource,
} from "./types";
import {
  honoFilePathConvention,
  hasDynamicRouteSegments,
  routeFileToManifestPath,
  routePathToShape,
  sortRoutesBySpecificity,
} from "./route-path";

interface RegisteredRoutePath {
  generated?: boolean;
  path: string;
  source: string;
}

function toLoader<TModule>(value: GlobValue<TModule>): () => Promise<TModule> {
  return async () => {
    if (typeof value === "function") {
      return (await (value as () => TModule | Promise<TModule>)()) as TModule;
    }
    return value;
  };
}

function eagerModule<TModule>(value: GlobValue<TModule>): TModule | undefined {
  return typeof value === "function" ? undefined : value;
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
  TContext,
  TModule,
  TData,
>(
  source: RouteSource<TContext, TModule, TData>
): source is RendererSource<TContext, TModule, TData> {
  return "renderer" in source;
}

function isIgnoredRouteFile<
  TContext,
  TModule,
  TData,
>(
  file: string,
  source: RouteSource<TContext, TModule, TData>,
  convention: NonNullable<RouteManifestConfig<TContext>["pathConvention"]>
): boolean {
  return Boolean(source.ignore?.(file) || convention.ignore?.(file));
}

function generatedRoutesConflict(
  a: RegisteredRoutePath,
  b: RegisteredRoutePath
): boolean {
  return (a.generated === true || b.generated === true) && a.path === b.path;
}

function assertNoGeneratedCollision(
  candidate: RegisteredRoutePath,
  registered: RegisteredRoutePath[]
): void {
  const collision = registered.find((entry) =>
    generatedRoutesConflict(candidate, entry)
  );
  if (collision) {
    throw new Error(
      `Duplicate route "${candidate.path}": ${collision.source} and ${candidate.source}`
    );
  }
}

function assertUniquePrimaryRoute(
  primaryShapes: Map<string, string>,
  path: string,
  source: string
): void {
  const shape = routePathToShape(path);
  const duplicate = primaryShapes.get(shape);
  if (duplicate) {
    throw new Error(`Duplicate route "${path}": ${duplicate} and ${source}`);
  }
  primaryShapes.set(shape, source);
}

export function createRouteManifest<
  TContext = unknown,
>(
  config: RouteManifestConfig<TContext>
): RouteManifest<TContext> {
  const sources = Array.isArray(config.sources)
    ? config.sources
    : [config.sources];
  const pathConvention = config.pathConvention ?? honoFilePathConvention;

  if (sources.length === 0) {
    throw new Error("createRouteManifest requires at least one route source.");
  }

  const generatedRoutes: GeneratedRoute<TContext>[] = [];
  const handlers: HonoRoute[] = [];
  const primaryShapes = new Map<string, string>();
  const registered: RegisteredRoutePath[] = [];
  const renderers: FileRouteRenderer<TContext>[] = [];
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

        assertUniquePrimaryRoute(primaryShapes, route.path, file);

        const primaryEntry = {
          path: route.path,
          source: file,
        };
        assertNoGeneratedCollision(primaryEntry, registered);
        registered.push(primaryEntry);

        for (const generatedRoute of source.renderer.generatedRoutes?.(route) ??
          []) {
          const generatedEntry = {
            generated: true,
            path: generatedRoute.path,
            source: `${file} generated route ${generatedRoute.path}`,
          };
          assertNoGeneratedCollision(generatedEntry, registered);
          generatedRoutes.push(generatedRoute);
          registered.push(generatedEntry);
        }
        continue;
      }

      const handler: HonoRoute = {
        file,
        id: routeId("hono", file),
        load: toLoader(value),
        module: eagerModule(value),
        path: manifestPath.path,
      };

      assertUniquePrimaryRoute(primaryShapes, handler.path, file);

      const handlerEntry = {
        path: handler.path,
        source: file,
      };
      assertNoGeneratedCollision(handlerEntry, registered);
      handlers.push(handler);
      registered.push(handlerEntry);
    }
  }

  const sortedHandlers = sortRoutesBySpecificity(handlers);
  const sortedRoutes = sortRoutesBySpecificity(routes);

  return {
    generatedRoutes,
    handlers: sortedHandlers,
    renderers,
    routes: sortedRoutes,
  };
}
