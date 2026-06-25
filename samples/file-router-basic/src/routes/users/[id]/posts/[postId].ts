import { Hono } from "hono";

const route = new Hono();

route.get("/", (c) =>
  c.json({
    id: c.req.param("postId"),
    userId: c.req.param("id"),
    title: `Post ${c.req.param("postId")}`,
  })
);

export default route;
