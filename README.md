# hono-kit

[![CI](https://github.com/yoshikouki/hono-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/yoshikouki/hono-kit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/yoshikouki/hono-kit/actions/workflows/codeql.yml/badge.svg)](https://github.com/yoshikouki/hono-kit/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Experimental Hono routing and renderer packages.

This repository is prepared to publish packages under the `@yoshikouki` npm
scope and uses Bun for local development.

## Packages

- `@yoshikouki/hono-file-router` - file-based routing core for Hono
- `@yoshikouki/hono-rsc-renderer` - React Server Components renderer middleware
- `@yoshikouki/hono-mdx-renderer` - Markdown/MDX route handlers for Hono

## Samples

- `samples/file-router-basic` - uses explicit route sources with `*.ts` Hono
  route modules, route groups, catch-all params, and app-owned inherited
  providers
- `samples/mdx-basic` - verifies Markdown and MDX route handlers without file
  routing
- `samples/rsc-vite-basic` - builds a Vite RSC Hono app and
  verifies same-path HTML and Flight responses
- `samples/full-stack-routing` - combines Hono route modules, RSC pages, and
  Markdown/MDX content routes in one router

## Design

The router package is the source of truth for route source contracts, path
normalization, manifests, route ordering, generated-route collision checks,
directory metadata, and Hono mounting. File discovery stays with applications
and build tools. Renderer packages keep presentation and transport details out
of the route core; RSC is exposed as Hono middleware while Markdown/MDX are
ordinary Hono route handlers.

Package contracts live with the package that owns them:

- [`packages/hono-file-router`](packages/hono-file-router) documents route
  source contracts, path conventions, manifests, directory helpers, and Hono
  mounting.
- [`packages/hono-rsc-renderer`](packages/hono-rsc-renderer) documents Hono RSC
  renderer middleware, same-path Flight negotiation, and Vite RSC setup.
- [`packages/hono-mdx-renderer`](packages/hono-mdx-renderer) documents Markdown
  and MDX Hono route handlers.

## Development

```sh
bun install
bun run lint
bun run typecheck
bun run build
bun run test
```

## Security

Dependency updates are tracked by Dependabot, CI verifies the Bun workspace on
pushes and pull requests, and CodeQL scans TypeScript sources on code changes
and a weekly schedule.

Please report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

## License

MIT
