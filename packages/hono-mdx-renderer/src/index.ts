import type { Context, Env, Handler } from "hono";

export type RouteSource<T> = T | (() => T | Promise<T>);
export type RenderResult = Response | string | Promise<Response | string>;

export interface MarkdownDocument {
  content: string;
  source: string;
}

export interface MarkdownRenderInput<E extends Env = Env> {
  c: Context<E>;
  markdown: MarkdownDocument;
  params: Record<string, string>;
  request: Request;
}

export interface MdxPageProps<E extends Env = Env> {
  c: Context<E>;
  params: Record<string, string>;
  request: Request;
}

export interface MdxRouteModule<E extends Env = Env> {
  default: (props: MdxPageProps<E>) => unknown | Promise<unknown>;
}

export interface MdxRenderInput<E extends Env = Env> {
  c: Context<E>;
  module: MdxRouteModule<E>;
  params: Record<string, string>;
  rendered: unknown;
  request: Request;
}

export interface MarkdownRendererOptions<E extends Env = Env> {
  htmlContentType?: string;
  renderMarkdown?: RenderMarkdown<E>;
}

export interface RawMarkdownRendererOptions {
  contentType?: string;
}

export interface MdxRendererOptions<E extends Env = Env> {
  htmlContentType?: string;
  renderMdx?: RenderMdx<E>;
}

export type RenderMarkdown<E extends Env = Env> = (
  input: MarkdownRenderInput<E>
) => RenderResult;

export type RenderMdx<E extends Env = Env> = (
  input: MdxRenderInput<E>
) => RenderResult;

const HTML_CONTENT_TYPE = "text/html;charset=utf-8";
const MARKDOWN_CONTENT_TYPE = "text/markdown;charset=utf-8";
const RE_FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function resolveSource<T>(source: RouteSource<T>): Promise<T> {
  return typeof source === "function"
    ? await (source as () => T | Promise<T>)()
    : source;
}

function stripFrontmatter(markdown: string): string {
  if (!(markdown.startsWith("---\n") || markdown.startsWith("---\r\n"))) {
    return markdown;
  }
  return markdown.replace(RE_FRONTMATTER, "");
}

function htmlResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: { "Content-Type": contentType },
  });
}

async function responseFromRendered(
  rendered: RenderResult,
  contentType: string
): Promise<Response> {
  const resolved = await rendered;
  return resolved instanceof Response
    ? resolved
    : htmlResponse(resolved, contentType);
}

function defaultRenderMarkdown<E extends Env>(
  input: MarkdownRenderInput<E>
): string {
  return `<!doctype html><html><body><pre>${escapeHtml(input.markdown.content)}</pre></body></html>`;
}

function defaultRenderMdx<E extends Env>(input: MdxRenderInput<E>): string {
  const body =
    typeof input.rendered === "string"
      ? input.rendered
      : `<pre>${escapeHtml(JSON.stringify(input.rendered, null, 2))}</pre>`;

  return `<!doctype html><html><body>${body}</body></html>`;
}

async function loadMarkdown(source: RouteSource<string>): Promise<string> {
  const loaded = await resolveSource(source);
  if (typeof loaded !== "string") {
    throw new Error("Markdown routes must load raw Markdown content.");
  }
  return loaded;
}

export function mdRenderer<E extends Env = Env>(
  source: RouteSource<string>,
  options: MarkdownRendererOptions<E> = {}
): Handler<E> {
  const htmlContentType = options.htmlContentType ?? HTML_CONTENT_TYPE;
  const renderMarkdown = options.renderMarkdown ?? defaultRenderMarkdown;

  return async (c) => {
    const markdownSource = await loadMarkdown(source);
    const markdown = {
      content: stripFrontmatter(markdownSource),
      source: markdownSource,
    };

    return responseFromRendered(
      renderMarkdown({
        c,
        markdown,
        params: c.req.param(),
        request: c.req.raw,
      }),
      htmlContentType
    );
  };
}

export function rawMarkdownRenderer<E extends Env = Env>(
  source: RouteSource<string>,
  options: RawMarkdownRendererOptions = {}
): Handler<E> {
  const contentType = options.contentType ?? MARKDOWN_CONTENT_TYPE;

  return async () =>
    new Response(await loadMarkdown(source), {
      headers: { "Content-Type": contentType },
    });
}

export function mdxRenderer<E extends Env = Env>(
  source: RouteSource<MdxRouteModule<E>>,
  options: MdxRendererOptions<E> = {}
): Handler<E> {
  const htmlContentType = options.htmlContentType ?? HTML_CONTENT_TYPE;
  const renderMdx = options.renderMdx ?? defaultRenderMdx;

  return async (c) => {
    const module = await resolveSource(source);
    if (!module || typeof module.default !== "function") {
      throw new Error("MDX routes must load a module with a default function.");
    }

    const props = {
      c,
      params: c.req.param(),
      request: c.req.raw,
    };
    const rendered = await module.default(props);

    return responseFromRendered(
      renderMdx({
        ...props,
        module,
        rendered,
      }),
      htmlContentType
    );
  };
}
