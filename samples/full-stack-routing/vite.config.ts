import mdx from "@mdx-js/rollup";
import rsc from "@vitejs/plugin-rsc";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { defineConfig } from "vite";

const mdxPlugin = mdx({
  remarkPlugins: [
    remarkFrontmatter,
    [remarkMdxFrontmatter, { default: {} }],
  ],
});

export default defineConfig({
  plugins: [
    {
      ...mdxPlugin,
      transform: (value, id) =>
        id.includes("?raw")
          ? Promise.resolve(undefined)
          : mdxPlugin.transform(value, id),
    },
    rsc(),
  ],
  environments: {
    rsc: {
      build: {
        rollupOptions: {
          input: { index: "./src/entry.rsc.tsx" },
        },
      },
    },
    // The SSR entry is auto-discovered from hono-rsc-renderer's
    // import.meta.viteRsc.import("./entry.ssr", { environment: "ssr" }).
    client: {
      build: {
        rollupOptions: {
          input: {
            index: "@yoshikouki/hono-rsc-renderer/entry.browser",
          },
        },
      },
    },
  },
});
