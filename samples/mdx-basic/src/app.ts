import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { mdRenderer, mdxRenderer } from "@yoshikouki/hono-mdx-renderer";
import { loadMdxRoute, loadTextRoute } from "./loader";

export const fileBasedRoutes = createFileRouter({
  base: "./routes",
  sources: [
    {
      files: {
        "./routes/docs/readme.md": () =>
          loadTextRoute("./routes/docs/readme.md"),
      },
      renderer: mdRenderer(),
    },
    {
      files: {
        "./routes/docs/guide.mdx": () =>
          loadMdxRoute("./routes/docs/guide.mdx"),
      },
      renderer: mdxRenderer(),
    },
  ],
});

export const app = new Hono();
app.route("/", fileBasedRoutes);
