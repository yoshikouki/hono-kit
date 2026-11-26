import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), rsc()],
  environments: {
    rsc: {
      build: {
        rollupOptions: {
          input: { index: "./src/index.tsx" },
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
