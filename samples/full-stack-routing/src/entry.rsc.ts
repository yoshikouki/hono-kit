import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { honoRoutes } from "@yoshikouki/hono-file-router/hono-routes";
import { mdRenderer, mdxRenderer } from "@yoshikouki/hono-mdx-renderer";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import { compileMdxRoute } from "./loaders";
import guideMdx from "./routes/content/docs/guide.mdx?raw";

const routes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./api/**/*.ts", { base: "./routes" }),
      routes: honoRoutes(),
    },
    {
      files: import.meta.glob("./**/*.tsx", { base: "./routes/pages" }),
      renderer: rscRenderer(),
    },
    {
      files: import.meta.glob("./**/*.md", {
        base: "./routes/content",
        query: "?raw",
        import: "default",
      }),
      renderer: mdRenderer(),
    },
    {
      files: {
        "./docs/guide.mdx": () => compileMdxRoute(guideMdx),
      },
      renderer: mdxRenderer(),
    },
  ],
});

const app = new Hono();
app.route("/", routes);

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
