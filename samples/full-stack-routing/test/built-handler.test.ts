import { expect, test } from "bun:test";

async function loadBuiltHandler() {
  const module = await import("../dist/rsc/index.js");
  return module.default as (request: Request) => Response | Promise<Response>;
}

test("built integrated router serves Hono route modules", async () => {
  const handler = await loadBuiltHandler();

  const ping = await handler(new Request("https://example.test/api/ping"));
  expect(ping.status).toBe(200);
  expect(await ping.json()).toEqual({
    ok: true,
    scope: "full-stack-routing",
  });

  const user = await handler(new Request("https://example.test/api/users/42"));
  expect(user.status).toBe(200);
  expect(await user.json()).toEqual({
    id: "42",
    name: "User 42",
  });
});

test("built integrated router serves RSC HTML and same-path Flight", async () => {
  const handler = await loadBuiltHandler();

  const htmlResponse = await handler(new Request("https://example.test/"));
  const html = await htmlResponse.text();
  expect(htmlResponse.status).toBe(200);
  expect(htmlResponse.headers.get("Content-Type")).toContain("text/html");
  expect(htmlResponse.headers.get("Cache-Control")).toBeNull();
  expect(html).not.toMatch(/<script\b[^>]*\bnonce=/i);
  expect(html).toContain("Full Stack Routing");

  const rscResponse = await handler(
    new Request("https://example.test/users/42", {
      headers: { Accept: "text/x-component", RSC: "1" },
    })
  );
  const flight = await rscResponse.text();
  expect(rscResponse.status).toBe(200);
  expect(rscResponse.headers.get("Content-Type")).toContain("text/x-component");
  expect(rscResponse.headers.get("Vary")).toContain("RSC");
  expect(rscResponse.headers.get("Vary")).toContain("Accept");
  expect(flight).toContain("Profile");
  expect(flight).toContain("42");
});

test("built integrated router keeps route-local components out of the route graph", async () => {
  const handler = await loadBuiltHandler();

  const response = await handler(
    new Request("https://example.test/_components/home-page")
  );
  expect(response.status).toBe(404);
});

test("built integrated router serves standard Markdown and MDX modules through RSC", async () => {
  const handler = await loadBuiltHandler();

  const markdownPage = await handler(
    new Request("https://example.test/docs/readme")
  );
  expect(markdownPage.status).toBe(200);
  expect(markdownPage.headers.get("Content-Type")).toContain("text/html");
  const markdownHtml = await markdownPage.text();
  expect(markdownHtml).toContain("Hello from integrated Markdown.");
  expect(markdownHtml).toContain('data-title="Full Stack Readme"');

  const rawMarkdown = await handler(
    new Request("https://example.test/docs/readme.md")
  );
  expect(rawMarkdown.status).toBe(200);
  expect(rawMarkdown.headers.get("Content-Type")).toContain("text/markdown");
  expect(await rawMarkdown.text()).toContain("title: Full Stack Readme");

  const mdxPage = await handler(new Request("https://example.test/docs/guide"));
  expect(mdxPage.status).toBe(200);
  expect(mdxPage.headers.get("Content-Type")).toContain("text/html");
  const mdxHtml = await mdxPage.text();
  expect(mdxHtml).toContain("Full Stack Guide");
  expect(mdxHtml).toContain('data-title="Full Stack Guide"');
  expect(mdxHtml).toContain('data-category="guide"');

  const mdxFlight = await handler(
    new Request("https://example.test/docs/guide", {
      headers: { Accept: "text/x-component", RSC: "1" },
    })
  );
  expect(mdxFlight.status).toBe(200);
  expect(mdxFlight.headers.get("Content-Type")).toContain("text/x-component");
  const flight = await mdxFlight.text();
  expect(flight).toContain("Full Stack Guide");
  expect(flight).toContain("standard Rollup integration");
  expect(flight).toContain("MDX expressions render as server content");
});
