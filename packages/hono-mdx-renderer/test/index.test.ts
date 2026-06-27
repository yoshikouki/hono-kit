import { expect, test } from "bun:test";
import { mdRenderer, mdxRenderer } from "../src";

test("mdRenderer accepts markdown routes and exposes raw markdown", async () => {
  const route = {
    file: "routes/docs/readme.md",
    id: "docs-readme",
    kind: "content",
    load: async () => "---\ntitle: Readme\n---\n# Readme",
    path: "/docs/readme",
    routeDirectory: "docs",
  };
  const renderer = mdRenderer();

  expect(renderer.accepts(route)).toBe(true);

  const html = await renderer.render({
    context: undefined,
    params: {},
    pathname: "/docs/readme",
    request: new Request("https://example.test/docs/readme"),
    route,
    url: new URL("https://example.test/docs/readme"),
  });
  expect(await html.text()).toContain("# Readme");

  const generated = renderer.generatedRoutes?.(route)?.[0];
  expect(generated?.path).toBe("/docs/readme.md");
  const raw = await generated?.render({
    context: undefined,
    generatedRoute: generated,
    params: {},
    pathname: "/docs/readme",
    request: new Request("https://example.test/docs/readme.md"),
    route,
    url: new URL("https://example.test/docs/readme.md"),
  });
  expect(await raw?.text()).toContain("title: Readme");
});

test("mdRenderer allows apps to customize HTML rendering and raw paths", async () => {
  const route = {
    file: "routes/docs/readme.md",
    id: "docs-readme",
    kind: "content",
    load: async () => "---\ntitle: Readme\n---\n# Readme",
    path: "/docs/readme",
    routeDirectory: "docs",
  };
  const renderer = mdRenderer({
    rawMarkdownPath: (path) => `/raw${path}`,
    renderMarkdown: ({ markdown }) =>
      `<article data-source-length="${markdown.source.length}">${markdown.content}</article>`,
  });

  const html = await renderer.render({
    context: undefined,
    params: {},
    pathname: "/docs/readme",
    request: new Request("https://example.test/docs/readme"),
    route,
    url: new URL("https://example.test/docs/readme"),
  });

  expect(await html.text()).toContain('<article data-source-length="');
  expect(renderer.generatedRoutes?.(route)?.[0]?.path).toBe(
    "/raw/docs/readme"
  );
});

test("mdxRenderer accepts mdx routes and renders default exports", async () => {
  const route = {
    file: "routes/docs/guide.mdx",
    id: "docs-guide",
    kind: "page",
    load: async () => ({
      default: () => "<article>Guide</article>",
    }),
    path: "/docs/guide",
    routeDirectory: "docs",
  };
  const renderer = mdxRenderer();

  expect(renderer.accepts(route)).toBe(true);

  const response = await renderer.render({
    context: undefined,
    params: {},
    pathname: "/docs/guide",
    request: new Request("https://example.test/docs/guide"),
    route,
    url: new URL("https://example.test/docs/guide"),
  });
  expect(await response.text()).toContain("<article>Guide</article>");
});

test("mdxRenderer allows apps to customize rendered module output", async () => {
  const route = {
    file: "routes/docs/guide.mdx",
    id: "docs-guide",
    kind: "page",
    load: async () => ({
      default: ({ params }: { params: Record<string, string> }) => ({
        title: `Guide ${params.slug}`,
      }),
    }),
    path: "/docs/:slug",
    routeDirectory: "docs",
  };
  const renderer = mdxRenderer({
    renderMdx: ({ rendered }) =>
      `<article>${JSON.stringify(rendered)}</article>`,
  });

  const response = await renderer.render({
    context: undefined,
    params: { slug: "advanced" },
    pathname: "/docs/advanced",
    request: new Request("https://example.test/docs/advanced"),
    route,
    url: new URL("https://example.test/docs/advanced"),
  });

  expect(await response.text()).toContain("Guide advanced");
});
