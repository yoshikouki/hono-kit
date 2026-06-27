import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [rsc()],
  environments: {
    rsc: {
      build: {
        rollupOptions: {
          input: { index: "./src/entry.rsc.tsx" },
        },
      },
    },
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
