import { Hono } from "hono";
import type { Env, Handler } from "hono";
import { validatedHonoApp } from "./hono-route";
import { createRouteManifest } from "./manifest";
import { sortRoutesBySpecificity } from "./route-path";
import type {
  CreateFileRouterOptions,
  FileRoute,
  FileRouteRenderer,
  FileRouterInput,
  GeneratedRoute,
  HonoRoute,
  MountFileRoutesOptions,
  RouteManifest,
} from "./types";

interface MountableRoute {
  path: string;
  register: () => void;
}

function resolveManifest<E extends Env>(
  input: FileRouterInput<E>
): RouteManifest<E> {
  if (input.manifest) {
    return input.manifest;
  }

  return createRouteManifest({ sources: input.sources });
}

function rendererForRoute<
  E extends Env,
  TModule,
  TData,
>(
  manifest: RouteManifest<E, TModule, TData>,
  route: FileRoute<TModule, TData>
): FileRouteRenderer<E, TModule, TData> {
  const renderer = manifest.renderers.find(
    (candidate) =>
      candidate.name === route.rendererName || candidate.accepts(route)
  );
  if (!renderer) {
    throw new Error(`No renderer registered for route "${route.path}".`);
  }
  return renderer;
}

function registerGeneratedRoute<E extends Env>(
  app: Hono<E>,
  path: string,
  method: GeneratedRoute["method"],
  handler: Handler<E>
): void {
  switch (method) {
    case "GET":
      app.get(path, handler);
      return;
    case "POST":
      app.post(path, handler);
      return;
    case "PUT":
      app.put(path, handler);
      return;
    case "PATCH":
      app.patch(path, handler);
      return;
    case "DELETE":
      app.delete(path, handler);
      return;
    case "ALL":
    case undefined:
      app.all(path, handler);
      return;
    default: {
      const unsupportedMethod: never = method;
      throw new Error(
        `Unsupported generated route method: ${unsupportedMethod}`
      );
    }
  }
}

function validateHonoRoute<E extends Env>(route: HonoRoute<E>): HonoRoute<E> {
  return {
    ...route,
    module: validatedHonoApp<E>(route.module, route.file),
  };
}

export function mountFileRoutes<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
>(
  app: Hono<E>,
  options: MountFileRoutesOptions<E, TModule, TData>
): Hono<E> {
  const manifest = resolveManifest(options);
  const handlerRoutes = manifest.handlers.map(validateHonoRoute);

  const routesById = new Map(manifest.routes.map((route) => [route.id, route]));
  const mountableRoutes: MountableRoute[] = manifest.routes.map((route) => ({
    path: route.path,
    register: () => {
      app.get(route.path, (c) => {
        const renderer = rendererForRoute(manifest, route);
        return renderer.render({ c, route });
      });
    },
  }));

  for (const generatedRoute of manifest.generatedRoutes) {
    const owner = routesById.get(generatedRoute.owner);
    if (!owner) {
      throw new Error(
        `Generated route "${generatedRoute.path}" references unknown owner "${generatedRoute.owner}".`
      );
    }
    mountableRoutes.push({
      path: generatedRoute.path,
      register: () => {
        registerGeneratedRoute(
          app,
          generatedRoute.path,
          generatedRoute.method ?? "GET",
          (c) => generatedRoute.render({ c, route: owner })
        );
      },
    });
  }

  for (const route of sortRoutesBySpecificity(mountableRoutes)) {
    route.register();
  }

  for (const handlerRoute of handlerRoutes) {
    app.route(handlerRoute.path, handlerRoute.module);
  }

  return app;
}

export function createFileRouter<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
>(
  options: CreateFileRouterOptions<E, TModule, TData>
): Hono<E> {
  const {
    manifest: _manifest,
    sources: _sources,
    ...honoOptions
  } = options;
  const app = new Hono<E>(honoOptions);
  return mountFileRoutes(app, options);
}
