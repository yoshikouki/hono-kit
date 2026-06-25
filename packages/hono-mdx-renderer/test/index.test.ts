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
