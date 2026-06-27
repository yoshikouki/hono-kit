# @yoshikouki/hono-mdx-renderer

Markdown and MDX file-route renderers for Hono apps.

This package stays on the file-route side of the boundary. It adapts `.md` and
`.mdx` sources into HTTP responses, while the application keeps control over
how Markdown or compiled MDX should become HTML.

## Markdown

`mdRenderer()` expects source modules to load raw Markdown strings. The primary
route renders HTML, and a generated route returns the raw Markdown.

```ts
import { mdRenderer } from "@yoshikouki/hono-mdx-renderer";

const renderer = mdRenderer({
  renderMarkdown: ({ markdown }) =>
    `<!doctype html><article>${markdown.content}</article>`,
});
```

The default raw path mirrors the primary route with a `.md` suffix:

```txt
/docs/readme -> /docs/readme.md
/            -> /index.md
```

Apps can disable or customize that endpoint:

```ts
mdRenderer({ rawMarkdown: false });

mdRenderer({
  rawMarkdownPath: (path) => `/raw${path}`,
});
```

## MDX

`mdxRenderer()` expects loaded modules to default export a function. The function
receives the file-router request contract and returns an app-defined render
value.

```ts
type MdxRouteModule = {
  default: (props: {
    context: unknown;
    params: Record<string, string>;
    request: Request;
  }) => unknown | Promise<unknown>;
};
```

The renderer turns that value into HTML. By default strings are inserted as the
body and non-strings are JSON-formatted inside a `<pre>`. Apps should provide
`renderMdx` when they have a real MDX compiler or component runtime:

```ts
const renderer = mdxRenderer({
  renderMdx: ({ rendered }) =>
    `<!doctype html><article>${String(rendered)}</article>`,
});
```

## Boundary

The package does not discover files, compile MDX, resolve layouts, or own Hono
middleware policy. Callers provide explicit source maps to
`@yoshikouki/hono-file-router` and keep build-tool details such as
`import.meta.glob(..., { query: "?raw" })` at the application edge.
