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

test("built integrated router serves RSC HTML and Flight routes", async () => {
  const handler = await loadBuiltHandler();

  const htmlResponse = await handler(new Request("https://example.test/"));
  const html = await htmlResponse.text();
  expect(htmlResponse.status).toBe(200);
  expect(htmlResponse.headers.get("Content-Type")).toContain("text/html");
  expect(html).toContain("Full Stack Routing");

  const rscResponse = await handler(
    new Request("https://example.test/__rsc/users/42")
  );
  const flight = await rscResponse.text();
  expect(rscResponse.status).toBe(200);
  expect(rscResponse.headers.get("Content-Type")).toContain("text/x-component");
  expect(flight).toContain("Profile");
  expect(flight).toContain("42");
});

test("built integrated router serves Markdown and MDX content routes", async () => {
  const handler = await loadBuiltHandler();

  const markdownPage = await handler(
    new Request("https://example.test/docs/readme")
  );
  expect(markdownPage.status).toBe(200);
  expect(await markdownPage.text()).toContain("Hello from integrated Markdown.");

  const rawMarkdown = await handler(
    new Request("https://example.test/docs/readme.md")
  );
  expect(rawMarkdown.status).toBe(200);
  expect(rawMarkdown.headers.get("Content-Type")).toContain("text/markdown");
  expect(await rawMarkdown.text()).toContain("title: Full Stack Readme");

  const mdxPage = await handler(new Request("https://example.test/docs/guide"));
  expect(mdxPage.status).toBe(200);
  expect(await mdxPage.text()).toContain("Full Stack Guide");
});
