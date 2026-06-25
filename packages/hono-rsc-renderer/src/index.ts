import type {
  FileRoute,
  FileRouteRenderer,
  RenderInput,
} from "@yoshikouki/hono-file-router";
import type { ReactNode } from "react";

export interface RscRendererOptions {
  renderRsc?: RenderRsc;
  renderHtml?: RenderHtml;
  rscPrefix?: string;
}

export interface RscRouteModule<TContext = unknown> {
  default: (props: RscPageProps<TContext>) => ReactNode | Promise<ReactNode>;
}

export interface RscPageProps<TContext = unknown> {
  context: TContext;
  params: Record<string, string>;
  request: Request;
}

export type RenderHtml = (
  rscStream: ReadableStream<Uint8Array>,
  options: { request: Request; signal: AbortSignal }
) => Promise<ReadableStream<Uint8Array>>;

export type RenderRsc = (
  node: ReactNode
) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;

const HTML_CONTENT_TYPE = "text/html;charset=utf-8";
const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const RSC_CACHE_CONTROL = "private, no-store";

function rscPathFor(path: string, prefix: string): string {
  return path === "/" ? prefix : `${prefix}${path}`;
}

async function renderModule<TContext>(
  input: RenderInput<TContext>
): Promise<ReactNode> {
  const module = (await input.route.load?.()) as
    | RscRouteModule<TContext>
    | undefined;
  if (!module || typeof module.default !== "function") {
    throw new Error(`${input.route.file} must default export a page function.`);
  }

  return module.default({
    context: input.context,
    params: input.params,
    request: input.request,
  });
}

async function defaultRenderHtml(
  rscStream: ReadableStream<Uint8Array>,
  options: { request: Request; signal: AbortSignal }
): Promise<ReadableStream<Uint8Array>> {
  // import.meta.viteRsc.import is statically transformed by @vitejs/plugin-rsc.
  const ssrEntry = await import.meta.viteRsc.import<
    typeof import("./entry.ssr")
  >("./entry.ssr", { environment: "ssr" });
  return ssrEntry.renderHtml(rscStream, { signal: options.signal });
}

function htmlResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: { "Content-Type": HTML_CONTENT_TYPE },
  });
}

function rscResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Cache-Control": RSC_CACHE_CONTROL,
      "Content-Type": RSC_CONTENT_TYPE,
    },
  });
}

async function renderRscStream<TContext>(
  input: RenderInput<TContext>,
  renderRsc: RenderRsc
): Promise<ReadableStream<Uint8Array>> {
  return renderRsc(await renderModule(input));
}

async function defaultRenderRsc(node: ReactNode): Promise<ReadableStream<Uint8Array>> {
  const { renderToReadableStream } = await import("@vitejs/plugin-rsc/rsc");
  return renderToReadableStream(node);
}

export function rscRenderer<TContext = unknown>(
  options: RscRendererOptions = {}
): FileRouteRenderer<TContext> {
  const renderHtml = options.renderHtml ?? defaultRenderHtml;
  const renderRsc = options.renderRsc ?? defaultRenderRsc;
  const rscPrefix = options.rscPrefix ?? "/__rsc";

  return {
    name: "rsc",
    accepts(route: FileRoute) {
      return route.kind === "rsc" || route.file.endsWith(".tsx");
    },
    generatedRoutes(route) {
      return [
        {
          kind: "rsc",
          method: "GET",
          owner: route.id,
          path: rscPathFor(route.path, rscPrefix),
          async render(input) {
            return rscResponse(await renderRscStream(input, renderRsc));
          },
        },
      ];
    },
    async render(input) {
      const rscStream = await renderRscStream(input, renderRsc);
      return htmlResponse(
        await renderHtml(rscStream, {
          request: input.request,
          signal: input.request.signal,
        })
      );
    },
  };
}
