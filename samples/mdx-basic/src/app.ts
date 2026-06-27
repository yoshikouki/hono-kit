import { Hono } from "hono";
import {
  mdRenderer,
  mdxRenderer,
  rawMarkdownRenderer,
} from "@yoshikouki/hono-mdx-renderer";
import { loadMdxRoute, loadTextRoute } from "./loader";

function document(title: string, body: string): string {
  return `<!doctype html><html><body><article data-title="${title}">${body}</article></body></html>`;
}

export const app = new Hono();

const readme = () => loadTextRoute("./routes/docs/readme.md");
const guide = () => loadMdxRoute("./routes/docs/guide.mdx");

app.get(
  "/docs/readme",
  mdRenderer(readme, {
    renderMarkdown: ({ markdown }) =>
      document("Markdown", `<pre>${markdown.content}</pre>`),
  })
);
app.get("/docs/readme.md", rawMarkdownRenderer(readme));
app.get(
  "/docs/guide",
  mdxRenderer(guide, {
    renderMdx: ({ rendered }) => document("MDX", String(rendered)),
  })
);
