import { spawn } from "node:child_process";
import { createServer, preview } from "vite";

const root = new URL(".", import.meta.url).pathname;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const getServerUrl = (server) => {
  const url = server.resolvedUrls?.local[0];
  assert(url, "Vite did not expose a local server URL");
  return url;
};

const assertResponse = async (baseUrl, mode) => {
  const htmlResponse = await fetch(baseUrl);
  assert(htmlResponse.status === 200, `${mode} HTML returned ${htmlResponse.status}`);
  assert(
    htmlResponse.headers.get("Content-Type")?.includes("text/html"),
    `${mode} HTML returned an unexpected Content-Type`
  );
  const html = await htmlResponse.text();
  assert(html.includes("RSC on Cloudflare Workers"), `${mode} HTML omitted the layout`);
  assert(html.includes("Hello from Hono RSC"), `${mode} HTML omitted the page`);

  const flightResponse = await fetch(baseUrl, { headers: { RSC: "1" } });
  assert(flightResponse.status === 200, `${mode} Flight returned ${flightResponse.status}`);
  assert(
    flightResponse.headers.get("Content-Type")?.includes("text/x-component"),
    `${mode} Flight returned an unexpected Content-Type`
  );
  assert(
    flightResponse.headers.get("Cache-Control") === "private, no-store",
    `${mode} Flight returned an unexpected Cache-Control`
  );
  assert(
    (await flightResponse.text()).includes("Hello from Hono RSC"),
    `${mode} Flight omitted the page`
  );
};

const testDev = async () => {
  const server = await createServer({ root, server: { host: "127.0.0.1", port: 0 } });
  try {
    await server.listen();
    await assertResponse(getServerUrl(server), "dev");
  } finally {
    await server.close();
  }
};

const run = (script, label) =>
  new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", script], {
      cwd: root,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with ${code ?? "a signal"}`));
      }
    });
  });

const testPreview = async () => {
  const server = await preview({ root, preview: { host: "127.0.0.1", port: 0 } });
  try {
    await assertResponse(getServerUrl(server), "preview");
  } finally {
    await server.close();
  }
};

await testDev();
await run("build", "Vite build");
await testPreview();
await run("deploy:dry-run", "Wrangler deploy dry run");
