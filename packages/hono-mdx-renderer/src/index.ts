import type {
  FileRoute,
  FileRouteRenderer,
  RenderInput,
} from "@yoshikouki/hono-file-router";

export interface MarkdownRendererOptions {
  rawMarkdown?: boolean;
}

export interface MdxRendererOptions {
  rawMarkdown?: boolean;
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

const HTML_CONTENT_TYPE = "text/html;charset=utf-8";
const MARKDOWN_CONTENT_TYPE = "text/markdown;charset=utf-8";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function markdownPathFor(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) {
    return markdown;
  }
  const end = markdown.indexOf("\n---", 4);
  return end === -1 ? markdown : markdown.slice(end + 4).replace(/^\n/, "");
}

async function loadMarkdown<TContext>(
  input: RenderInput<TContext>
): Promise<string> {
  const loaded = await input.route.load?.();
  if (typeof loaded !== "string") {
    throw new Error(`${input.route.file} must load raw Markdown content.`);
  }
  return loaded;
}

async function renderMarkdown<TContext>(
  input: RenderInput<TContext>
): Promise<Response> {
  const markdown = stripFrontmatter(await loadMarkdown(input));
  return new Response(
    `<!doctype html><html><body><pre>${escapeHtml(markdown)}</pre></body></html>`,
    {
      headers: { "Content-Type": HTML_CONTENT_TYPE },
    }
  );
}

async function renderMdxModule<TContext>(
  input: RenderInput<TContext>
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

  const body =
    typeof rendered === "string"
      ? rendered
      : `<pre>${escapeHtml(JSON.stringify(rendered, null, 2))}</pre>`;

  return new Response(`<!doctype html><html><body>${body}</body></html>`, {
    headers: { "Content-Type": HTML_CONTENT_TYPE },
  });
}

export function mdRenderer<TContext = unknown>(
  options: MarkdownRendererOptions = {}
): FileRouteRenderer<TContext> {
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
          path: markdownPathFor(route.path),
          async render(input) {
            return new Response(await loadMarkdown(input), {
              headers: { "Content-Type": MARKDOWN_CONTENT_TYPE },
            });
          },
        },
      ];
    },
    render(input) {
      return renderMarkdown(input);
    },
  };
}

export function mdxRenderer<TContext = unknown>(
  _options: MdxRendererOptions = {}
): FileRouteRenderer<TContext> {
  return {
    name: "mdx",
    accepts(route: FileRoute) {
      return route.file.endsWith(".mdx");
    },
    render(input) {
      return renderMdxModule(input);
    },
  };
}
