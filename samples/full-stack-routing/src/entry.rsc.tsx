import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { honoRoutes } from "@yoshikouki/hono-file-router/hono-routes";
import { mdRenderer, mdxRenderer } from "@yoshikouki/hono-mdx-renderer";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import { compileMdxRoute } from "./loaders";
import HomePage from "./routes/pages/index";
import UserPage from "./routes/pages/users/[id]";
import guideMdx from "./routes/content/docs/guide.mdx?raw";

const contentAndApiRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./api/**/*.ts", { base: "./routes" }),
      routes: honoRoutes(),
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

app.get(
  "*",
  rscRenderer(({ children }) => (
    <html lang="en">
      <head>
        <title>Full Stack Routing</title>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  ))
);

app.get("/", (c) => c.render(<HomePage />));
app.get("/users/:id", (c) =>
  c.render(<UserPage id={c.req.param("id")} />)
);
app.route("/", contentAndApiRoutes);

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
