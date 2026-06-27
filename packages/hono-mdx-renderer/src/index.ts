import type {
  FileRoute,
  FileRouteRenderer,
  RenderInput,
} from "@yoshikouki/hono-file-router";

export interface MarkdownRendererOptions<TContext = unknown> {
  htmlContentType?: string;
  rawMarkdown?: boolean;
  rawMarkdownPath?: (path: string) => string;
  renderMarkdown?: RenderMarkdown<TContext>;
}

export interface MdxRendererOptions<TContext = unknown> {
  htmlContentType?: string;
  renderMdx?: RenderMdx<TContext>;
}

export interface MdxRouteModule<TContext = unknown> {
  default: (
    props: MdxPageProps<TContext>
  ) => unknown | Promise<unknown>;
}

export interface MdxPageProps<TContext = unknown> {
  context: TContext;
  params: Record<string, string>;
  request: Request;
}

export interface MarkdownDocument {
  content: string;
  source: string;
}

export interface MarkdownRenderInput<TContext = unknown>
  extends RenderInput<TContext, string> {
  markdown: MarkdownDocument;
}

export interface MdxRenderInput<TContext = unknown>
  extends RenderInput<TContext, MdxRouteModule<TContext>> {
  rendered: unknown;
}

export type RenderMarkdown<TContext = unknown> = (
  input: MarkdownRenderInput<TContext>
) => RenderResult;

export type RenderMdx<TContext = unknown> = (
  input: MdxRenderInput<TContext>
) => RenderResult;

type RenderResult = Response | string | Promise<Response | string>;

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

function defaultMarkdownPath(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
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
  if (resolved instanceof Response) {
    return resolved;
  }
  return htmlResponse(resolved, contentType);
}

async function loadMarkdown<TContext>(
  input: RenderInput<TContext, string>
): Promise<string> {
  const loaded = await input.route.load?.();
  if (typeof loaded !== "string") {
    throw new Error(`${input.route.file} must load raw Markdown content.`);
  }
  return loaded;
}

function defaultRenderMarkdown<TContext>(
  input: MarkdownRenderInput<TContext>
): string {
  return `<!doctype html><html><body><pre>${escapeHtml(input.markdown.content)}</pre></body></html>`;
}

async function renderMarkdown<TContext>(
  input: RenderInput<TContext, string>,
  options: Required<
    Pick<MarkdownRendererOptions<TContext>, "htmlContentType" | "renderMarkdown">
  >
): Promise<Response> {
  const source = await loadMarkdown(input);
  const markdown = {
    content: stripFrontmatter(source),
    source,
  };
  return responseFromRendered(
    options.renderMarkdown({ ...input, markdown }),
    options.htmlContentType
  );
}

function defaultRenderMdx<TContext>(input: MdxRenderInput<TContext>): string {
  const body =
    typeof input.rendered === "string"
      ? input.rendered
      : `<pre>${escapeHtml(JSON.stringify(input.rendered, null, 2))}</pre>`;

  return `<!doctype html><html><body>${body}</body></html>`;
}

async function renderMdxModule<TContext>(
  input: RenderInput<TContext, MdxRouteModule<TContext>>,
  options: Required<Pick<MdxRendererOptions<TContext>, "htmlContentType" | "renderMdx">>
): Promise<Response> {
  const module = (await input.route.load?.()) as
    | MdxRouteModule<TContext>
    | undefined;
  if (!module || typeof module.default !== "function") {
    throw new Error(`${input.route.file} must default export an MDX function.`);
  }
  const rendered = await module.default({
    context: input.context,
    params: input.params,
    request: input.request,
  });

  return responseFromRendered(
    options.renderMdx({ ...input, rendered }),
    options.htmlContentType
  );
}

export function mdRenderer<TContext = unknown>(
  options: MarkdownRendererOptions<TContext> = {}
): FileRouteRenderer<TContext> {
  const resolvedOptions = {
    htmlContentType: options.htmlContentType ?? HTML_CONTENT_TYPE,
    rawMarkdownPath: options.rawMarkdownPath ?? defaultMarkdownPath,
    renderMarkdown: options.renderMarkdown ?? defaultRenderMarkdown,
  };

  return {
    name: "md",
    accepts(route: FileRoute) {
      return route.file.endsWith(".md");
    },
    generatedRoutes(route) {
      if (options.rawMarkdown === false) {
        return [];
      }
      return [
        {
          kind: "markdown",
          method: "GET",
          owner: route.id,
          path: resolvedOptions.rawMarkdownPath(route.path),
          async render(input) {
            return new Response(
              await loadMarkdown(input as RenderInput<TContext, string>),
              {
                headers: { "Content-Type": MARKDOWN_CONTENT_TYPE },
              }
            );
          },
        },
      ];
    },
    render(input) {
      return renderMarkdown(input as RenderInput<TContext, string>, resolvedOptions);
    },
  };
}

export function mdxRenderer<TContext = unknown>(
  options: MdxRendererOptions<TContext> = {}
): FileRouteRenderer<TContext> {
  const resolvedOptions = {
    htmlContentType: options.htmlContentType ?? HTML_CONTENT_TYPE,
    renderMdx: options.renderMdx ?? defaultRenderMdx,
  };

  return {
    name: "mdx",
    accepts(route: FileRoute) {
      return route.file.endsWith(".mdx");
    },
    render(input) {
      return renderMdxModule(
        input as RenderInput<TContext, MdxRouteModule<TContext>>,
        resolvedOptions
      );
    },
  };
}
