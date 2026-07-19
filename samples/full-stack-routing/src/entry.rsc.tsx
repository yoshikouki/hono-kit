import { Hono } from "hono";
import {
  createFileRouter,
  type HonoRouteSource,
} from "@yoshikouki/hono-file-router";
import { rscRenderer } from "@yoshikouki/hono-rsc-renderer";
import Guide, {
  frontmatter as guideFrontmatter,
} from "./routes/content/docs/guide.mdx";
import Readme, {
  frontmatter as readmeFrontmatter,
} from "./routes/content/docs/readme.md";
import readmeMd from "./routes/content/docs/readme.md?raw";

const fileRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob<HonoRouteSource>("./**/*.{ts,tsx}", {
        base: "./routes",
        eager: true,
      }),
      ignore: (file) => file.split("/").includes("_components"),
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

app.get("/docs/readme", (c) =>
  c.render(
    <article data-title={String(readmeFrontmatter.title)}>
      <Readme />
    </article>
  )
);
app.get("/docs/readme.md", (c) =>
  c.body(readmeMd, 200, { "Content-Type": "text/markdown;charset=utf-8" })
);
app.get("/docs/guide", (c) =>
  c.render(
    <article data-title={String(guideFrontmatter.title)}>
      <Guide />
    </article>
  )
);
app.route("/", fileRoutes);

export default function handler(
  request: Request
): Response | Promise<Response> {
  return app.fetch(request);
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
