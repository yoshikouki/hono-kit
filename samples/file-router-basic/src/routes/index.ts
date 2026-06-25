import { Hono } from "hono";

const route = new Hono();

route.get("/", (c) => c.html("<main>Home</main>"));

export default route;
