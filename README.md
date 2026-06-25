# hono-kit

Experimental Hono routing and renderer packages.

This repository publishes under the `@yoshikouki` npm scope and uses Bun for
local development.

## Packages

- `@yoshikouki/hono-file-router` - file-based routing core for Hono
- `@yoshikouki/hono-rsc-renderer` - React Server Components renderer integration
- `@yoshikouki/hono-mdx-renderer` - Markdown/MDX renderer integration

## Samples

- `samples/file-router-basic` - uses `createFileRouter({ base: "./routes" })`
  with the default `*.ts` Hono route module convention
- `samples/mdx-basic` - verifies Markdown and MDX renderer integration with
  explicit route sources
- `samples/rsc-basic` - builds a Vite RSC app and verifies built HTML and
  `/__rsc` Flight responses

## Design

The router package is the source of truth for route discovery, manifest
validation, route ordering, generated-route collision checks, and Hono mounting.
Renderer packages declare their own generated endpoints, so RSC and Markdown/MDX
details do not leak into the route core.

See [docs/contracts.md](docs/contracts.md) for the public contracts verified by
the current tests and samples.

## Development

```sh
bun install
bun run typecheck
bun run build
bun run test
```

## License

MIT
