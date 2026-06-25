import { expect, test } from "bun:test";
import { app } from "../src/app";

test("serves markdown and raw markdown routes", async () => {
  const markdownPage = await app.request("/docs/readme");
  expect(await markdownPage.text()).toContain("Hello from Markdown.");

  const rawMarkdown = await app.request("/docs/readme.md");
  expect(rawMarkdown.headers.get("Content-Type")).toContain("text/markdown");
  expect(await rawMarkdown.text()).toContain("title: Readme");
});

test("serves mdx routes", async () => {
  const mdxPage = await app.request("/docs/guide");

  expect(mdxPage.status).toBe(200);
  expect(await mdxPage.text()).toContain("Guide from MDX");
});
