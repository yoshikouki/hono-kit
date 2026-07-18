import type { Context, Env, MiddlewareHandler } from "hono";
import { createElement, Fragment } from "react";
import type { ReactNode } from "react";

// biome-ignore lint/suspicious/noEmptyInterface: Applications add their render props through module augmentation.
export interface RscRenderProps {}

export interface RscLayoutProps extends RscRenderProps {
  children?: ReactNode;
}

export type RscLayout = (
  props: RscLayoutProps
) => ReactNode | Promise<ReactNode>;

export interface RscRendererComponentProps extends RscLayoutProps {
  Layout: RscLayout;
}

export type RscRendererComponent<E extends Env = Env> = (
  props: RscRendererComponentProps,
  c: Context<E>
) => ReactNode | Promise<ReactNode>;

export interface RscRequestNegotiation<E extends Env = Env> {
  isRscRequest: (c: Context<E>) => boolean;
  varyHeaders: readonly [string, ...string[]];
}

export interface RscRendererOptions<E extends Env = Env> {
  getNonce?: (c: Context<E>) => string | undefined;
  negotiation?: RscRequestNegotiation<E>;
  onError?: (error: unknown, c: Context<E>) => void;
  renderHtml?: RenderHtml;
  renderRsc?: RenderRsc;
}

export interface RenderRscOptions {
  onError?: (error: unknown) => void;
  request: Request;
  signal: AbortSignal;
}

export interface RenderHtmlOptions extends RenderRscOptions {
  nonce?: string;
}

export type RenderHtml = (
  rscStream: ReadableStream<Uint8Array>,
  options: RenderHtmlOptions
) => Promise<ReadableStream<Uint8Array>>;

export type RenderRsc = (
  node: ReactNode,
  options: RenderRscOptions
) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;

declare module "hono" {
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: Hono exposes ContextRenderer as an augmentable interface.
    (
      content: ReactNode,
      props?: RscRenderProps
    ): Response | Promise<Response>;
  }
}

const HTML_CONTENT_TYPE = "text/html;charset=utf-8";
const RSC_CONTENT_TYPE = "text/x-component;charset=utf-8";
const RSC_CACHE_CONTROL = "private, no-store";
const NONCE_HTML_CACHE_CONTROL = "private, no-store";
const DEFAULT_VARY_HEADERS = ["RSC", "Accept"] as const;

const DEFAULT_LAYOUT: RscLayout = ({ children }) =>
  createElement(Fragment, null, children);

async function defaultRenderHtml(
  rscStream: ReadableStream<Uint8Array>,
  options: RenderHtmlOptions
): Promise<ReadableStream<Uint8Array>> {
  // import.meta.viteRsc.import is statically transformed by @vitejs/plugin-rsc.
  const ssrEntry = await import.meta.viteRsc.import<
    typeof import("./entry.ssr")
  >("./entry.ssr", { environment: "ssr" });
  return ssrEntry.renderHtml(rscStream, {
    nonce: options.nonce,
    onError: options.onError,
    signal: options.signal,
  });
}

async function defaultRenderRsc(
  node: ReactNode,
  options: RenderRscOptions
): Promise<ReadableStream<Uint8Array>> {
  const { renderToReadableStream } = await import("@vitejs/plugin-rsc/rsc");
  return renderToReadableStream(node, {
    onError: options.onError,
    signal: options.signal,
  });
}

function appendVary(headers: Headers, names: readonly string[]): void {
  const existing = (headers.get("Vary") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const normalized = new Set(existing.map((name) => name.toLowerCase()));
  for (const name of names) {
    const trimmedName = name.trim();
    const normalizedName = trimmedName.toLowerCase();
    if (trimmedName && !normalized.has(normalizedName)) {
      existing.push(trimmedName);
      normalized.add(normalizedName);
    }
  }
  headers.set("Vary", existing.join(", "));
}

function defaultIsRscRequest(c: Context): boolean {
  const accept = c.req.header("Accept") ?? "";
  return c.req.header("RSC") === "1" || accept.includes("text/x-component");
}

function htmlResponse(
  c: Context,
  stream: ReadableStream<Uint8Array>,
  varyHeaders: readonly string[],
  nonce: string | undefined
): Response {
  const response = c.body(stream, {
    headers: { "Content-Type": HTML_CONTENT_TYPE },
  });
  if (nonce !== undefined && !response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", NONCE_HTML_CACHE_CONTROL);
  }
  appendVary(response.headers, varyHeaders);
  return response;
}

function rscResponse(
  c: Context,
  stream: ReadableStream<Uint8Array>,
  varyHeaders: readonly string[]
): Response {
  const response = c.body(stream, {
    headers: { "Content-Type": RSC_CONTENT_TYPE },
  });
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", RSC_CACHE_CONTROL);
  }
  appendVary(response.headers, varyHeaders);
  return response;
}

function createRenderer<E extends Env>(
  c: Context<E>,
  Layout: RscLayout,
  component: RscRendererComponent<E> | undefined,
  options: ResolvedRscRendererOptions<E>
) {
  return async (
    children: ReactNode,
    props: RscRenderProps = {}
  ): Promise<Response> => {
    const onErrorHandler = options.onError;
    const onError = onErrorHandler
      ? (error: unknown) => onErrorHandler(error, c)
      : undefined;
    const node = component
      ? createElement(
          (componentProps: RscRendererComponentProps) =>
            component(componentProps, c),
          { ...props, Layout },
          children
        )
      : children;
    const rscStream = await options.renderRsc(node, {
      onError,
      request: c.req.raw,
      signal: c.req.raw.signal,
    });

    if (options.negotiation.isRscRequest(c)) {
      return rscResponse(c, rscStream, options.negotiation.varyHeaders);
    }

    const nonce = options.getNonce(c);
    return htmlResponse(
      c,
      await options.renderHtml(rscStream, {
        nonce,
        onError,
        request: c.req.raw,
        signal: c.req.raw.signal,
      }),
      options.negotiation.varyHeaders,
      nonce
    );
  };
}

interface ResolvedRscRendererOptions<E extends Env> {
  getNonce: (c: Context<E>) => string | undefined;
  negotiation: RscRequestNegotiation<E>;
  onError?: (error: unknown, c: Context<E>) => void;
  renderHtml: RenderHtml;
  renderRsc: RenderRsc;
}

export function rscRenderer<
  E extends Env = Env,
>(
  component?: RscRendererComponent<E>,
  options: RscRendererOptions<E> = {}
): MiddlewareHandler<E> {
  const negotiation = options.negotiation ?? {
    isRscRequest: defaultIsRscRequest,
    varyHeaders: DEFAULT_VARY_HEADERS,
  };
  const resolvedOptions = {
    getNonce: options.getNonce ?? (() => undefined),
    negotiation,
    onError: options.onError,
    renderHtml: options.renderHtml ?? defaultRenderHtml,
    renderRsc: options.renderRsc ?? defaultRenderRsc,
  } satisfies ResolvedRscRendererOptions<E>;

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
