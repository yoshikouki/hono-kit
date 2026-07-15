import type { Context, Env, MiddlewareHandler } from "hono";
import { createElement, Fragment } from "react";
import type { ReactNode } from "react";

export interface RscRenderProps {
  [key: string]: unknown;
}

export interface RscRendererOptions<E extends Env = Env> {
  getNonce?: (c: Context<E>) => string | undefined;
  isRscRequest?: (c: Context<E>) => boolean;
  renderHtml?: RenderHtml;
  renderRsc?: RenderRsc;
  varyHeaders?: string[];
}

export type RscLayout = (
  props: RscRenderProps & {
    children?: ReactNode;
    Layout: RscLayout;
  },
  c: Context
) => ReactNode | Promise<ReactNode>;

export type RenderHtml = (
  rscStream: ReadableStream<Uint8Array>,
  options: { nonce?: string; request: Request; signal: AbortSignal }
) => Promise<ReadableStream<Uint8Array>>;

export type RenderRsc = (
  node: ReactNode
) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;

declare module "hono" {
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: Hono exposes ContextRenderer as an augmentable interface.
    (
      content: ReactNode | Promise<ReactNode>,
      props?: RscRenderProps
    ): Response | Promise<Response>;
  }
}

const HTML_CONTENT_TYPE = "text/html;charset=utf-8";
const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const RSC_CACHE_CONTROL = "private, no-store";
const DEFAULT_VARY_HEADERS = ["RSC", "Accept"];

const DEFAULT_LAYOUT: RscLayout = ({ children }) =>
  createElement(Fragment, null, children);

async function defaultRenderHtml(
  rscStream: ReadableStream<Uint8Array>,
  options: { nonce?: string; request: Request; signal: AbortSignal }
): Promise<ReadableStream<Uint8Array>> {
  // import.meta.viteRsc.import is statically transformed by @vitejs/plugin-rsc.
  const ssrEntry = await import.meta.viteRsc.import<
    typeof import("./entry.ssr")
  >("./entry.ssr", { environment: "ssr" });
  return ssrEntry.renderHtml(rscStream, {
    nonce: options.nonce,
    signal: options.signal,
  });
}

async function defaultRenderRsc(
  node: ReactNode
): Promise<ReadableStream<Uint8Array>> {
  const { renderToReadableStream } = await import("@vitejs/plugin-rsc/rsc");
  return renderToReadableStream(node);
}

function appendVary(headers: Headers, names: string[]): void {
  const existing = new Set(
    (headers.get("Vary") ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
  );
  for (const name of names) {
    existing.add(name);
  }
  headers.set("Vary", [...existing].join(", "));
}

function defaultIsRscRequest(c: Context): boolean {
  const accept = c.req.header("Accept") ?? "";
  return c.req.header("RSC") === "1" || accept.includes("text/x-component");
}

function htmlResponse(
  stream: ReadableStream<Uint8Array>,
  varyHeaders: string[]
): Response {
  const response = new Response(stream, {
    headers: { "Content-Type": HTML_CONTENT_TYPE },
  });
  appendVary(response.headers, varyHeaders);
  return response;
}

function rscResponse(
  stream: ReadableStream<Uint8Array>,
  varyHeaders: string[]
): Response {
  const response = new Response(stream, {
    headers: {
      "Cache-Control": RSC_CACHE_CONTROL,
      "Content-Type": RSC_CONTENT_TYPE,
    },
  });
  appendVary(response.headers, varyHeaders);
  return response;
}

function createRenderer<E extends Env>(
  c: Context<E>,
  Layout: RscLayout,
  component: RscLayout | undefined,
  options: Required<RscRendererOptions<E>>
) {
  return async (
    children: ReactNode | Promise<ReactNode>,
    props: RscRenderProps = {}
  ): Promise<Response> => {
    const resolvedChildren = await children;
    const node = component
      ? await component({ ...props, Layout, children: resolvedChildren }, c)
      : resolvedChildren;
    const rscStream = await options.renderRsc(node);

    if (options.isRscRequest(c)) {
      return rscResponse(rscStream, options.varyHeaders);
    }

    return htmlResponse(
      await options.renderHtml(rscStream, {
        nonce: options.getNonce(c),
        request: c.req.raw,
        signal: c.req.raw.signal,
      }),
      options.varyHeaders
    );
  };
}

export function rscRenderer<
  E extends Env = Env,
>(
  component?: RscLayout,
  options: RscRendererOptions<E> = {}
): MiddlewareHandler<E> {
  const resolvedOptions = {
    getNonce: options.getNonce ?? (() => undefined),
    isRscRequest: options.isRscRequest ?? defaultIsRscRequest,
    renderHtml: options.renderHtml ?? defaultRenderHtml,
    renderRsc: options.renderRsc ?? defaultRenderRsc,
    varyHeaders: options.varyHeaders ?? DEFAULT_VARY_HEADERS,
  } satisfies Required<RscRendererOptions<E>>;

  return (c, next) => {
    const currentLayout = (c.getLayout() ?? DEFAULT_LAYOUT) as RscLayout;
    if (component) {
      c.setLayout((props) =>
        component({ ...props, Layout: currentLayout }, c)
      );
    }
    c.setRenderer(createRenderer(c, currentLayout, component, resolvedOptions));
    return next();
  };
}
