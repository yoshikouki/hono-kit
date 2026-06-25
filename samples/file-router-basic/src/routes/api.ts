import { Hono } from "hono";

const api = new Hono();

api.get("/ping", (c) => c.json({ ok: true }));

export default api;
