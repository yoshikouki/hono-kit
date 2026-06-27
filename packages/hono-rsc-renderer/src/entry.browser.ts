import { createFromFetch } from "@vitejs/plugin-rsc/browser";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";

function fetchRsc(url = new URL(window.location.href)) {
  return createFromFetch<ReactNode>(
    fetch(`${url.pathname}${url.search}`, {
      headers: { Accept: "text/x-component", RSC: "1" },
    })
  );
}

async function main() {
  const initial = await fetchRsc();
  const root = hydrateRoot(document, initial);

  if (import.meta.hot) {
    import.meta.hot.on("rsc:update", async () => {
      root.render(await fetchRsc());
    });
  }
}

main();
