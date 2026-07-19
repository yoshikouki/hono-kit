import type { Context, Env } from "hono";
import type { HonoOptions } from "hono/hono-base";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
export type GlobValue<T = unknown> = T | (() => T | Promise<T>);
export type GlobFiles<T = unknown> = Record<string, GlobValue<T>>;
export type RouteFileIgnore = (file: string) => boolean;

export interface RoutePathResult {
  path: string;
}

export interface RoutePathConvention {
  ignore?: RouteFileIgnore;
  name: string;
  toPath: (file: string) => RoutePathResult;
}

export interface FileRoute<TModule = unknown, TData = unknown> {
  file: string;
  id: string;
  load?: () => Promise<TModule>;
  metadata?: TData;
  path: string;
  rendererName?: string;
}

export interface RenderInput<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
> {
  c: Context<E>;
  route: FileRoute<TModule, TData>;
}

export interface GeneratedRoute<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
> {
  method?: HttpMethod;
  owner: string;
  path: string;
  render: (
    input: RenderInput<E, TModule, TData>
  ) => Response | Promise<Response>;
}

export interface FileRouteSource<TModule = unknown> {
  contents?: string;
  file: string;
  load?: () => Promise<TModule>;
}

export interface FileRouteAdapter<TModule = unknown, TData = unknown> {
  accepts: (source: FileRouteSource<TModule>) => boolean;
  name: string;
  toRoutes: (
    source: FileRouteSource<TModule>
  ) =>
    | FileRoute<TModule, TData>
    | FileRoute<TModule, TData>[]
    | null
    | undefined;
}

export interface FileRouteRenderer<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
> {
  accepts: (route: FileRoute<TModule, TData>) => boolean;
  generatedRoutes?: (
    route: FileRoute<TModule, TData>
  ) => GeneratedRoute<E, TModule, TData>[];
  name: string;
  render: (
    input: RenderInput<E, TModule, TData>
  ) => Response | Promise<Response>;
}

export interface HonoRouteModule {
  default?: HonoLikeApp;
}

export interface HonoLikeApp {
  fetch: (request: Request, env?: unknown) => Response | Promise<Response>;
}

export interface HonoRoute<TModule = unknown> {
  file: string;
  id: string;
  load: () => Promise<TModule>;
  module?: TModule;
  path: string;
}

export interface RendererSource<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
> {
  dynamicRoutes?: boolean;
  files: GlobFiles<TModule>;
  ignore?: RouteFileIgnore;
  renderer: FileRouteRenderer<E, TModule, TData>;
}

export interface HonoRoutesSource<TModule = unknown> {
  dynamicRoutes?: boolean;
  files: GlobFiles<TModule>;
  ignore?: RouteFileIgnore;
  renderer?: never;
}

export type RouteSource<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
> =
  | RendererSource<E, TModule, TData>
  | HonoRoutesSource<TModule>;

export type AnyRouteSource<E extends Env = Env> = RouteSource<
  E,
  unknown,
  unknown
>;

export type RouteSources<E extends Env = Env> =
  | AnyRouteSource<E>
  | AnyRouteSource<E>[];

export interface RouteManifestConfig<
  E extends Env = Env,
  _TModule = unknown,
  _TData = unknown,
> {
  pathConvention?: RoutePathConvention;
  sources: RouteSources<E>;
}

export interface RouteManifest<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
> {
  generatedRoutes: GeneratedRoute<E, TModule, TData>[];
  handlers: HonoRoute<TModule>[];
  renderers: FileRouteRenderer<E, TModule, TData>[];
  routes: FileRoute<TModule, TData>[];
}

export type FileRouterInput<
  E extends Env = Env,
  _TModule = unknown,
  _TData = unknown,
> = FileRouterOptions<E> &
  (
    | {
        manifest: RouteManifest<E>;
        sources?: never;
      }
    | {
        manifest?: never;
        sources: RouteSources<E>;
      }
  );

export type FileRouterOptions<E extends Env = Env> = HonoOptions<E>;

export type CreateFileRouterOptions<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
> = FileRouterInput<E, TModule, TData>;

export type MountFileRoutesOptions<
  E extends Env = Env,
  TModule = unknown,
  TData = unknown,
> = FileRouterInput<E, TModule, TData>;
