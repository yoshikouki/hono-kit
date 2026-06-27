import { expect, test } from "bun:test";
import { Hono } from "hono";
import { mdRenderer, mdxRenderer, rawMarkdownRenderer } from "../src";

test("mdRenderer serves Markdown HTML and rawMarkdownRenderer serves raw Markdown", async () => {
  const app = new Hono();
  const source = "---\ntitle: Readme\n---\n# Readme";

  app.get("/docs/readme", mdRenderer(source));
  app.get("/docs/readme.md", rawMarkdownRenderer(source));

  const html = await app.request("/docs/readme");
  expect(html.headers.get("Content-Type")).toContain("text/html");
  expect(await html.text()).toContain("# Readme");

  const raw = await app.request("/docs/readme.md");
  expect(raw.headers.get("Content-Type")).toContain("text/markdown");
  expect(await raw.text()).toContain("title: Readme");
});

test("mdRenderer allows apps to customize HTML rendering", async () => {
  const app = new Hono();
  const source = "---\ntitle: Readme\n---\n# Readme";

  app.get(
    "/docs/readme",
    mdRenderer(source, {
      renderMarkdown: ({ markdown }) =>
        `<article data-source-length="${markdown.source.length}">${markdown.content}</article>`,
    })
  );

  const html = await app.request("/docs/readme");
  expect(await html.text()).toContain('<article data-source-length="');
});

test("mdxRenderer serves default exports", async () => {
  const app = new Hono();

  app.get(
    "/docs/guide",
    mdxRenderer({
      default: () => "<article>Guide</article>",
    })
  );

  const response = await app.request("/docs/guide");
  expect(response.headers.get("Content-Type")).toContain("text/html");
  expect(await response.text()).toContain("<article>Guide</article>");
});

test("mdxRenderer passes Hono params and allows custom output", async () => {
  const app = new Hono();

  app.get(
    "/docs/:slug",
    mdxRenderer(
      {
        default: ({ params }) => ({
          title: `Guide ${params.slug}`,
        }),
      },
      {
        renderMdx: ({ rendered }) =>
          `<article>${JSON.stringify(rendered)}</article>`,
      }
    )
  );

  const response = await app.request("/docs/advanced");
  expect(await response.text()).toContain("Guide advanced");
});
