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
  expect(html).toMatch(/<script\b[^>]*\bid=/);
});

test("built HTML gives every React and Vite owned script the request CSP nonce", async () => {
  const handler = await loadBuiltHandler();
  const firstResponse = await handler(new Request("https://example.test/"));
  const firstHtml = await firstResponse.text();
  const firstCsp = firstResponse.headers.get("Content-Security-Policy") ?? "";
  const firstNonce = firstCsp.match(/'nonce-([^']+)'/)?.[1];
  const firstScripts = firstHtml.match(/<script\b[^>]*>/g) ?? [];
  const firstModulePreloads =
    firstHtml.match(/<link\b(?=[^>]*\brel="modulepreload")[^>]*>/g) ?? [];

  expect(firstNonce).toBeTruthy();
  expect(firstScripts.length).toBeGreaterThan(0);
  for (const script of firstScripts) {
    expect(script).toContain(`nonce="${firstNonce}"`);
  }
  expect(firstModulePreloads.length).toBeGreaterThan(0);

  const secondResponse = await handler(new Request("https://example.test/"));
  const secondCsp =
    secondResponse.headers.get("Content-Security-Policy") ?? "";
  const secondNonce = secondCsp.match(/'nonce-([^']+)'/)?.[1];

  expect(secondNonce).toBeTruthy();
  expect(secondNonce).not.toBe(firstNonce);
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
