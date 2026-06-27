import { expect, test } from "vitest";
import { app } from "../src/app";

test("serves a file-based page route", async () => {
  const response = await app.request("/");

  expect(response.status).toBe(200);
  expect(await response.text()).toContain("<main>Home</main>");
});

test("serves dynamic and nested dynamic Hono route modules", async () => {
  const user = await app.request("/users/42");
  expect(user.headers.get("Content-Type")).toContain("application/json");
  expect(await user.json()).toEqual({
    id: "42",
    name: "User 42",
  });

  const post = await app.request("/users/42/posts/9");
  expect(post.headers.get("Content-Type")).toContain("application/json");
  expect(await post.json()).toEqual({
    id: "9",
    userId: "42",
    title: "Post 9",
  });
});

test("serves plain Hono route modules", async () => {
  const response = await app.request("/api/ping");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("serves catch-all routes while omitting route groups from the URL", async () => {
  const response = await app.request("/docs/install/cloudflare");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    section: "guides",
    slug: "install/cloudflare",
  });
});

test("falls back to Hono 404 behavior for missing routes", async () => {
  const response = await app.request("/missing");

  expect(response.status).toBe(404);
});
