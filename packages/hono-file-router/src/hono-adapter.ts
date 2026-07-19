import { Hono } from "hono";
import type { Env, Handler } from "hono";
import { createRouteManifest } from "./manifest";
import { sortRoutesBySpecificity } from "./route-path";
import type {
  CreateFileRouterOptions,
  FileRoute,
  FileRouteRenderer,
  FileRouterInput,
  GeneratedRoute,
  HonoLikeApp,
  HonoRouteModule,
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

function honoAppFromModule(module: unknown): HonoLikeApp {
  const candidate =
    module && typeof module === "object" && "default" in module
      ? (module as HonoRouteModule).default
      : module;

  if (!candidate || typeof (candidate as HonoLikeApp).fetch !== "function") {
    throw new Error("Hono route modules must default export a Hono app.");
  }

  return candidate as HonoLikeApp;
}

function stripMountPath(pathname: string, mountPath: string): string {
  if (mountPath === "/") {
    return pathname;
  }
  if (pathname === mountPath) {
    return "/";
  }
  if (pathname.startsWith(`${mountPath}/`)) {
    return pathname.slice(mountPath.length) || "/";
  }
  return pathname;
}

function requestForMount(request: Request, mountPath: string): Request {
  const url = new URL(request.url);
  url.pathname = stripMountPath(url.pathname, mountPath);
  return new Request(url, request);
}

function isRoutableHonoApp(
  value: HonoLikeApp
): value is HonoLikeApp & { routes: unknown[] } {
  return Array.isArray((value as { routes?: unknown }).routes);
}

function mountedHonoApp<E extends Env>(
  mountPath: string,
  routeApp: HonoLikeApp
): HonoLikeApp {
  if (!isRoutableHonoApp(routeApp)) {
    return {
      fetch: (request, env) =>
        routeApp.fetch(requestForMount(request, mountPath), env),
    };
  }

  const mounted = new Hono<E>();
  mounted.route(mountPath, routeApp as unknown as Hono<E>);
  return {
    fetch: (request, env) => mounted.fetch(request, env as E["Bindings"]),
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

  for (const handlerRoute of manifest.handlers) {
    if (handlerRoute.module) {
      const routeApp = honoAppFromModule(handlerRoute.module);
      if (isRoutableHonoApp(routeApp)) {
        app.route(handlerRoute.path, routeApp as unknown as Hono<E>);
        continue;
      }
    }

    let mountedApp: HonoLikeApp | undefined;
    const handler: Handler<E> = async (c) => {
      if (!mountedApp) {
        const module = await handlerRoute.load();
        const routeApp = honoAppFromModule(module);
        mountedApp = mountedHonoApp(handlerRoute.path, routeApp);
      }
      return mountedApp.fetch(c.req.raw, c.env);
    };
    app.all(handlerRoute.path, handler);
    if (handlerRoute.path !== "/") {
      app.all(`${handlerRoute.path}/*`, handler);
    }
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
