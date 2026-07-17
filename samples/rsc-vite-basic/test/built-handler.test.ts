import { expect, test } from "bun:test";

async function loadBuiltHandler() {
  const module = await import("../dist/rsc/index.js");
  return module.default as (request: Request) => Response | Promise<Response>;
}

function responseNonce(response: Response): string {
  const csp = response.headers.get("Content-Security-Policy") ?? "";
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  if (!nonce) {
    throw new Error("Expected a CSP nonce");
  }
  return nonce;
}

function scriptTags(html: string): string[] {
  return html.match(/<script\b[^>]*>/gi) ?? [];
}

test("built Vite RSC handler serves HTML", async () => {
  const handler = await loadBuiltHandler();
  const response = await handler(new Request("https://example.test/"));
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/html");
  expect(html).toContain("RSC Basic");
  expect(html).toMatch(/<script\b[^>]*\bid=/i);
});

test("built HTML gives every React and Vite owned script the request CSP nonce", async () => {
  const handler = await loadBuiltHandler();
  const [firstResponse, secondResponse] = await Promise.all([
    handler(new Request("https://example.test/")),
    handler(new Request("https://example.test/")),
  ]);
  const [firstHtml, secondHtml] = await Promise.all([
    firstResponse.text(),
    secondResponse.text(),
  ]);
  const firstNonce = responseNonce(firstResponse);
  const secondNonce = responseNonce(secondResponse);

  expect(firstResponse.headers.get("Cache-Control")).toBe("private, no-store");
  expect(secondResponse.headers.get("Cache-Control")).toBe("private, no-store");
  for (const [html, nonce] of [
    [firstHtml, firstNonce],
    [secondHtml, secondNonce],
  ] as const) {
    const scripts = scriptTags(html);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script).toContain(`nonce="${nonce}"`);
    }
  }
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
