import { Hono } from "hono";
import type { Context } from "hono";
import { createElement } from "react";
import {
  type RscLayout,
  rscRenderer,
} from "@yoshikouki/hono-rsc-renderer";

declare module "@yoshikouki/hono-rsc-renderer" {
  interface RscRenderProps {
    title?: string;
  }
}

interface AppEnv {
  Variables: {
    userName: string;
  };
}

const app = new Hono<AppEnv>();

app.use(
  "*",
  rscRenderer<AppEnv>(({ children, Layout, title }, c) => {
    const userName: string = c.var.userName;
    return createElement(Layout, { title }, userName, children);
  })
);

app.get("/valid", (c) => c.render("content", { title: "Valid" }));
app.get("/invalid", (c) =>
  // @ts-expect-error RscRenderProps rejects undeclared render props.
  c.render("content", { titel: "Typo" })
);

const layout: RscLayout = ({ children }) => children;
// @ts-expect-error Layout is a props-only React component.
layout({ children: "content" }, {} as Context<AppEnv>);

rscRenderer(undefined, {
  negotiation: {
    isRscRequest: () => true,
    // @ts-expect-error Custom negotiation must name at least one Vary header.
    varyHeaders: [],
  },
});

// @ts-expect-error Negotiation headers cannot be detached from the predicate.
rscRenderer(undefined, { isRscRequest: () => true });
