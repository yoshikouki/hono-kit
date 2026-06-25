import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { mdRenderer, mdxRenderer } from "@yoshikouki/hono-mdx-renderer";
import { loadMdxRoute, loadTextRoute } from "./loader";

export const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: {
        "./docs/readme.md": () => loadTextRoute("./routes/docs/readme.md"),
      },
      renderer: mdRenderer(),
    },
    {
      files: {
        "./docs/guide.mdx": () => loadMdxRoute("./routes/docs/guide.mdx"),
      },
      renderer: mdxRenderer(),
    },
  ],
});

export const app = new Hono();
app.route("/", fileBasedRoutes);
