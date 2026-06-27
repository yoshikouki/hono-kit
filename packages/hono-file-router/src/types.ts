import type { Env } from "hono";
import type { HonoOptions } from "hono/hono-base";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
export type RouteParams = Record<string, string>;
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

export interface MatchedRoute<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  context: TContext;
  params: RouteParams;
  pathname: string;
  request: Request;
  route: FileRoute<TModule, TData>;
  url: URL;
}

export interface RenderInput<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> extends MatchedRoute<TContext, TModule, TData> {
  generatedRoute?: GeneratedRoute<TContext, TModule, TData>;
}

export interface GeneratedRoute<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  method?: HttpMethod;
  owner: string;
  path: string;
  render: (
    input: RenderInput<TContext, TModule, TData>
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
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  accepts: (route: FileRoute<TModule, TData>) => boolean;
  generatedRoutes?: (
    route: FileRoute<TModule, TData>
  ) => GeneratedRoute<TContext, TModule, TData>[];
  name: string;
  render: (
    input: RenderInput<TContext, TModule, TData>
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
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  dynamicRoutes?: boolean;
  files: GlobFiles<TModule>;
  ignore?: RouteFileIgnore;
  renderer: FileRouteRenderer<TContext, TModule, TData>;
}

export interface HonoRoutesSource<TModule = unknown> {
  dynamicRoutes?: boolean;
  files: GlobFiles<TModule>;
  ignore?: RouteFileIgnore;
  renderer?: never;
}

export type RouteSource<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> =
  | RendererSource<TContext, TModule, TData>
  | HonoRoutesSource<TModule>;

export type AnyRouteSource<TContext = unknown> = RouteSource<
  TContext,
  unknown,
  unknown
>;

export type RouteSources<TContext = unknown> =
  | AnyRouteSource<TContext>
  | AnyRouteSource<TContext>[];

export interface RouteManifestConfig<
  TContext = unknown,
  _TModule = unknown,
  _TData = unknown,
> {
  pathConvention?: RoutePathConvention;
  sources: RouteSources<TContext>;
}

export interface RouteManifest<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  generatedRoutes: GeneratedRoute<TContext, TModule, TData>[];
  handlers: HonoRoute<TModule>[];
  renderers: FileRouteRenderer<TContext, TModule, TData>[];
  routes: FileRoute<TModule, TData>[];
}

export type FileRouterInput<
  TContext = unknown,
  _TModule = unknown,
  _TData = unknown,
  E extends Env = Env,
> = FileRouterOptions<TContext, E> &
  (
    | {
        manifest: RouteManifest<TContext>;
        sources?: never;
      }
    | {
        manifest?: never;
        sources: RouteSources<TContext>;
      }
  );

export interface FileRouterOptions<
  TContext = unknown,
  E extends Env = Env,
> extends HonoOptions<E> {
  createContext?: (request: Request) => TContext | Promise<TContext>;
}

export type CreateFileRouterOptions<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
  E extends Env = Env,
> = FileRouterInput<TContext, TModule, TData, E>;

export type MountFileRoutesOptions<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
  E extends Env = Env,
> = FileRouterInput<TContext, TModule, TData, E>;
