import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { honoRoutes } from "@yoshikouki/hono-file-router/hono-routes";
import {
  mdRenderer,
  mdxRenderer,
  rawMarkdownRenderer,
} from "@yoshikouki/hono-mdx-renderer";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import { compileMdxRoute } from "./loaders";
import HomePage from "./routes/pages/index";
import UserPage from "./routes/pages/users/[id]";
import guideMdx from "./routes/content/docs/guide.mdx?raw";
import readmeMd from "./routes/content/docs/readme.md?raw";

const apiRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob("./api/**/*.ts", { base: "./routes" }),
      routes: honoRoutes(),
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
app.get("/docs/readme", mdRenderer(readmeMd));
app.get("/docs/readme.md", rawMarkdownRenderer(readmeMd));
app.get("/docs/guide", mdxRenderer(() => compileMdxRoute(guideMdx)));
app.route("/", apiRoutes);

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
