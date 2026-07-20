# hono-kit

[![CI](https://github.com/yoshikouki/hono-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/yoshikouki/hono-kit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/yoshikouki/hono-kit/actions/workflows/codeql.yml/badge.svg)](https://github.com/yoshikouki/hono-kit/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Experimental Hono routing and renderer packages.

This repository is prepared to publish packages under the `@yoshikouki` npm
scope and uses Bun for local development.

The current developer preview is published with the `beta` npm dist-tag:

```sh
npm install @yoshikouki/hono-file-router@beta
npm install @yoshikouki/hono-rsc-renderer@beta
```

## Packages

- `@yoshikouki/hono-file-router` - file-based routing core for Hono
- `@yoshikouki/hono-rsc-renderer` - React Server Components renderer middleware

## Samples

- `samples/file-router-basic` - uses explicit route sources with `*.ts` Hono
  route modules, route groups, catch-all params, and app-owned inherited
  providers
- `samples/rsc-vite-basic` - builds a Vite RSC Hono app and
  verifies same-path HTML and Flight responses
- `samples/rsc-cloudflare-basic` - runs the RSC renderer in Cloudflare Workers
  through the official Cloudflare Vite plugin and verifies its deploy bundle
- `samples/full-stack-routing` - combines file-routed Hono API modules,
  file-routed RSC page modules, and Markdown/MDX content routes in one app

## Design

The router package is the source of truth for route source contracts, path
normalization, manifests, route ordering, generated-route collision checks,
directory metadata, and Hono mounting. File discovery stays with applications
and build tools. The RSC renderer keeps presentation and transport details out
of the route core. Applications compile Markdown and MDX with standard build
tool integrations and pass the resulting components to ordinary Hono handlers.

Package contracts live with the package that owns them:

- [`packages/hono-file-router`](packages/hono-file-router) documents route
  source contracts, path conventions, manifests, directory helpers, and Hono
  mounting.
- [`packages/hono-rsc-renderer`](packages/hono-rsc-renderer) documents Hono RSC
  renderer middleware, same-path Flight negotiation, and Vite RSC setup.

## Development

```sh
bun install
bun run lint
bun run typecheck
bun run build
bun run test
```

## Publishing

Each package version is an explicit release declaration. A pull request that
changes files below `packages/<name>` must also assign that package a new
semantic version. Prerelease versions use their first prerelease identifier as
the npm dist-tag, so `0.1.0-beta.1` is published with the `beta` tag. Stable
versions use `latest`.

After the change reaches `main`, the publish workflow repeats the full
verification suite, generates publish-only package directories from the built
`dist` output, inspects each package tarball, and publishes only versions that
do not already exist in npm. The generated manifests replace development-only
source exports with the `publishConfig.exports` contract and include the root
license with every package.

npm Trusted Publishing authenticates the GitHub-hosted runner with OIDC; the
repository does not store an npm publish token. The `npm-publish` GitHub
environment and `.github/workflows/publish.yml` must match the trusted
publisher configured for every package on npm.

## Security

Dependency updates are tracked by Dependabot, CI verifies the Bun workspace on
pushes and pull requests, and CodeQL scans TypeScript sources on code changes
and a weekly schedule.

Please report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

## License

MIT
