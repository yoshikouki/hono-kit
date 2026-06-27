import { Hono } from "hono";
import HomePage from "./_components/home-page";

const route = new Hono();

route.get("/", (c) => c.render(<HomePage />));

export default route;
