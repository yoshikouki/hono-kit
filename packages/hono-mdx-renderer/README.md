# @yoshikouki/hono-mdx-renderer

Markdown and MDX route handlers for Hono apps.

This package stays on the Hono side of the boundary. It adapts app-provided
Markdown strings and compiled MDX route modules into `Handler`s, while the
application keeps control over route registration, source loading, compilation,
layout, and authorization.

## Markdown

`mdRenderer(source, options)` returns a Hono handler. The `source` can be a raw
Markdown string or a function that returns one.

```ts
import { Hono } from "hono";
import {
  mdRenderer,
  rawMarkdownRenderer,
} from "@yoshikouki/hono-mdx-renderer";

const app = new Hono();
const readme = () => import("./docs/readme.md?raw").then((mod) => mod.default);

app.get(
  "/docs/readme",
  mdRenderer(readme, {
    renderMarkdown: ({ markdown }) =>
      `<!doctype html><article>${markdown.content}</article>`,
  })
);

app.get("/docs/readme.md", rawMarkdownRenderer(readme));
```

The default Markdown renderer strips frontmatter and escapes the remaining
content into a `<pre>`. Apps should provide `renderMarkdown` when they have a
real Markdown pipeline.

## MDX

`mdxRenderer(source, options)` returns a Hono handler. The `source` can be a
compiled MDX route module or a function that loads one.

```ts
import type { Context } from "hono";
import { mdxRenderer } from "@yoshikouki/hono-mdx-renderer";

type MdxRouteModule = {
  default: (props: {
    c: Context;
    params: Record<string, string>;
    request: Request;
  }) => unknown | Promise<unknown>;
};

app.get(
  "/docs/guide",
  mdxRenderer(loadGuide, {
    renderMdx: ({ rendered }) =>
      `<!doctype html><article>${String(rendered)}</article>`,
  })
);
```

The renderer calls the module default export with `{ c, params, request }`.
By default, string results are inserted as the body and non-strings are
JSON-formatted inside a `<pre>`. Apps should provide `renderMdx` when they have
a real MDX compiler or component runtime.

## Boundary

The package does not discover files, compile MDX, resolve layouts, create raw
Markdown sibling routes automatically, or own middleware policy. Callers choose
the Hono path and method explicitly:

```ts
app.get("/docs/readme", mdRenderer(readme));
app.get("/docs/readme.md", rawMarkdownRenderer(readme));
app.get("/docs/guide", mdxRenderer(loadGuide));
```

Use `@yoshikouki/hono-file-router` separately when you want file-based Hono
route modules. Markdown and MDX content routes are ordinary Hono routes.
