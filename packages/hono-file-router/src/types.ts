export type FileRouteKind =
  | "page"
  | "content"
  | "handler"
  | (string & {});

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";
export type RouteParams = Record<string, string>;
export type GlobValue<T = unknown> = T | (() => T | Promise<T>);
export type GlobFiles<T = unknown> = Record<string, GlobValue<T>>;

export interface FileRoute<TModule = unknown, TData = unknown> {
  file: string;
  id: string;
  kind: FileRouteKind;
  load?: () => Promise<TModule>;
  metadata?: TData;
  path: string;
  rendererName?: string;
  routeDirectory: string;
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
  kind?: string;
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
  kind?: FileRouteKind;
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

export interface HonoRoutesProducer {
  name: string;
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
  path: string;
  routeDirectory: string;
  routesName: string;
}

export type RendererSource<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> = {
  dynamicRoutes?: boolean;
  files: GlobFiles<TModule>;
  kind?: FileRouteKind;
  renderer: FileRouteRenderer<TContext, TModule, TData>;
  routes?: never;
};

export type HonoRoutesSource<TModule = unknown> = {
  dynamicRoutes?: boolean;
  files: GlobFiles<TModule>;
  kind?: FileRouteKind;
  renderer?: never;
  routes: HonoRoutesProducer;
};

export type RouteSource<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> =
  | RendererSource<TContext, TModule, TData>
  | HonoRoutesSource<TModule>;

export interface RouteManifestConfig<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> {
  base: string;
  sources: RouteSource<TContext, TModule, TData>[];
}

export interface DefaultRouteManifestConfig {
  base: string;
  sources?: never;
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
  TModule = unknown,
  TData = unknown,
> =
  | RouteManifestConfig<TContext, TModule, TData>
  | DefaultRouteManifestConfig
  | { manifest: RouteManifest<TContext, TModule, TData> };

export interface FileRouterOptions<TContext = unknown> {
  createContext?: (request: Request) => TContext | Promise<TContext>;
  strict?: boolean;
}

export type CreateFileRouterOptions<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> = FileRouterInput<TContext, TModule, TData> & FileRouterOptions<TContext>;

export type MountFileRoutesOptions<
  TContext = unknown,
  TModule = unknown,
  TData = unknown,
> = FileRouterInput<TContext, TModule, TData> & FileRouterOptions<TContext>;
