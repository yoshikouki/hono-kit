import { expect, test } from "bun:test";
import { rscRenderer } from "../src";

function textStream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

const route = {
  file: "routes/about/index.tsx",
  id: "about",
  kind: "page",
  load: async () => ({
    default: ({ params }: { params: Record<string, string> }) =>
      `<main>${params.name ?? "about"}</main>`,
  }),
  path: "/about/:name",
  routeDirectory: "about",
};

test("accepts tsx routes and declares an RSC generated route", () => {
  const renderer = rscRenderer();
  const generatedRoutes = renderer.generatedRoutes?.(route) ?? [];

  expect(renderer.accepts(route)).toBe(true);
  expect(generatedRoutes[0]?.path).toBe("/__rsc/about/:name");
});

test("renders HTML and RSC responses from a default page export", async () => {
  const renderer = rscRenderer({
    renderHtml: async (rscStream) => rscStream,
    renderRsc: (node) => textStream(String(node)),
  });
  const input = {
    context: undefined,
    params: { name: "codex" },
    pathname: "/about/codex",
    request: new Request("https://example.test/about/codex"),
    route,
    url: new URL("https://example.test/about/codex"),
  };

  const html = await renderer.render(input);
  expect(html.headers.get("Content-Type")).toContain("text/html");
  expect(await html.text()).toContain("codex");

  const generated = renderer.generatedRoutes?.(route)?.[0];
  const rsc = await generated?.render({ ...input, generatedRoute: generated });
  expect(rsc?.headers.get("Content-Type")).toContain("text/x-component");
  expect(await rsc?.text()).toContain("codex");
});
