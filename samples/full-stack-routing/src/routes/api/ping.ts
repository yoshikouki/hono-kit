import { Hono } from "hono";

const api = new Hono();

api.get("/", (c) => c.json({ ok: true, scope: "full-stack-routing" }));

export default api;
