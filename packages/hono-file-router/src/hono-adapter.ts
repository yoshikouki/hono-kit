import { Hono } from "hono";
import type { Env, Handler } from "hono";
import { createRouteManifest } from "./manifest";
import { pathnameFromRoutePath, sortRoutesBySpecificity } from "./route-path";
import type {
  CreateFileRouterOptions,
  FileRoute,
  FileRouteRenderer,
  FileRouterInput,
  FileRouterOptions,
  GeneratedRoute,
  HonoLikeApp,
  HonoRouteModule,
  MountFileRoutesOptions,
  RenderInput,
  RouteManifest,
  RouteParams,
} from "./types";

interface MountableRoute {
  path: string;
  register: () => void;
}

function resolveManifest<
  TContext,
  E extends Env,
>(
  input: FileRouterInput<TContext, unknown, unknown, E>
): RouteManifest<TContext> {
  if (input.manifest) {
    return input.manifest;
  }

  return createRouteManifest({ sources: input.sources });
}

function rendererForRoute<
  TContext,
  TModule,
  TData,
>(
  manifest: RouteManifest<TContext, TModule, TData>,
  route: FileRoute<TModule, TData>
): FileRouteRenderer<TContext, TModule, TData> {
  const renderer = manifest.renderers.find(
    (candidate) =>
      candidate.name === route.rendererName || candidate.accepts(route)
  );
  if (!renderer) {
    throw new Error(`No renderer registered for route "${route.path}".`);
  }
  return renderer;
}

async function createRenderInput<
  TContext,
  TModule,
  TData,
  E extends Env,
>(
  request: Request,
  route: FileRoute<TModule, TData>,
  params: RouteParams,
  options: FileRouterOptions<TContext, E>,
  generatedRoute?: GeneratedRoute<TContext, TModule, TData>
): Promise<RenderInput<TContext, TModule, TData>> {
  const context = options.createContext
    ? await options.createContext(request)
    : (undefined as TContext);
  return {
    context,
    generatedRoute,
    params,
    pathname: pathnameFromRoutePath(route.path, params),
    request,
    route,
    url: new URL(request.url),
  };
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
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
>(
  app: Hono<E>,
  options: MountFileRoutesOptions<TContext, TModule, TData, E>
): Hono<E> {
  const manifest = resolveManifest(options);

  const routesById = new Map(manifest.routes.map((route) => [route.id, route]));
  const mountableRoutes: MountableRoute[] = manifest.routes.map((route) => ({
    path: route.path,
    register: () => {
      app.get(route.path, async (c) => {
        const renderer = rendererForRoute(manifest, route);
        return renderer.render(
          await createRenderInput(c.req.raw, route, c.req.param(), options)
        );
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
          async (c) =>
            generatedRoute.render(
              await createRenderInput(
                c.req.raw,
                owner,
                c.req.param(),
                options,
                generatedRoute
              )
            )
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
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
>(
  options: CreateFileRouterOptions<TContext, TModule, TData, E>
): Hono<E> {
  const {
    createContext: _createContext,
    manifest: _manifest,
    sources: _sources,
    ...honoOptions
  } = options;
  const app = new Hono<E>(honoOptions);
  return mountFileRoutes(app, options);
}
