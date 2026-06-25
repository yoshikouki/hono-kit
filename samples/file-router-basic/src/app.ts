import { Hono } from "hono";
import { createFileRouter } from "@yoshikouki/hono-file-router";
import { honoRoutes } from "@yoshikouki/hono-file-router/hono-routes";

export const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: {
        "./index.ts": () => import("./routes/index"),
        "./users/[id]/index.ts": () => import("./routes/users/[id]/index"),
        "./users/[id]/posts/[postId].ts": () =>
          import("./routes/users/[id]/posts/[postId]"),
        "./api.ts": () => import("./routes/api"),
      },
      routes: honoRoutes(),
    },
  ],
});

export const app = new Hono();
app.route("/", fileBasedRoutes);
