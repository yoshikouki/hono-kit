import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { mdRenderer, mdxRenderer } from "@yoshikouki/hono-mdx-renderer";
import { loadMdxRoute, loadTextRoute } from "./loader";

function document(title: string, body: string): string {
  return `<!doctype html><html><body><article data-title="${title}">${body}</article></body></html>`;
}

export const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: {
        "./docs/readme.md": () => loadTextRoute("./routes/docs/readme.md"),
      },
      renderer: mdRenderer({
        renderMarkdown: ({ markdown }) =>
          document("Markdown", `<pre>${markdown.content}</pre>`),
      }),
    },
    {
      files: {
        "./docs/guide.mdx": () => loadMdxRoute("./routes/docs/guide.mdx"),
      },
      renderer: mdxRenderer({
        renderMdx: ({ rendered }) => document("MDX", String(rendered)),
      }),
    },
  ],
});

export const app = new Hono();
app.route("/", fileBasedRoutes);
