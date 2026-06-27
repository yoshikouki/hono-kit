import { expect, test } from "bun:test";

async function loadBuiltHandler() {
  const module = await import("../dist/rsc/index.js");
  return module.default as (request: Request) => Response | Promise<Response>;
}

test("built Vite RSC handler serves HTML", async () => {
  const handler = await loadBuiltHandler();
  const response = await handler(new Request("https://example.test/"));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/html");
  expect(html).toContain("RSC Basic");
  expect(html).toContain("<script id=");
});

test("built Vite RSC handler serves dynamic HTML and same-path Flight", async () => {
  const handler = await loadBuiltHandler();

  const htmlResponse = await handler(
    new Request("https://example.test/users/42")
  );
  const html = await htmlResponse.text();
  expect(html).toContain("User");
  expect(html).toContain("42");

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
  expect(flight).toContain("User");
  expect(flight).toContain("42");
});
