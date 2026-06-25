import { Hono } from "hono";

const api = new Hono();

api.get("/", (c) =>
  c.json({
    id: c.req.param("id"),
    name: `User ${c.req.param("id")}`,
  })
);

export default api;
