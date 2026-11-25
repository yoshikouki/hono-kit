import { Hono } from "hono";
import type { HonoRouteSource } from "@yoshikouki/hono-file-router";
import { createFileRouter } from "@yoshikouki/hono-file-router";

export const fileBasedRoutes = createFileRouter({
  sources: [
    {
      files: import.meta.glob<HonoRouteSource>("./**/*.ts", {
        base: "./routes",
        eager: true,
      }),
    },
  ],
});

export const app = new Hono();
app.route("/", fileBasedRoutes);
