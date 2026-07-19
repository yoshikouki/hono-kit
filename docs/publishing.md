# Publishing packages

The repository publishes packages from `main` without an npm token. GitHub
Actions builds and inspects exact tarballs in an unprivileged job, then a
separate `npm-publish` environment job uses npm Trusted Publishing (OIDC) to
publish only versions that do not already exist.

## Release contract

- Every change below `packages/<name>` must update that package's version.
- A prerelease uses its first prerelease identifier as the npm dist-tag. For
  example, `0.1.0-beta.1` uses `beta`.
- A stable version uses `latest`.
- Published versions are immutable. A retry skips versions already present in
  npm and continues with any unpublished package.
- Development manifests resolve workspace imports from `src`. The release
  preparation step creates separate manifests whose exports resolve only from
  the built `dist` directory.

## One-time npm bootstrap

npm requires a package to exist before it can have a Trusted Publisher. Create
each package once from the reviewed publishing branch using the interactive npm
session on the trusted Raspberry Pi. The bootstrap version is intentionally
published under the non-default `bootstrap` tag; the first beta remains
available for the OIDC workflow to publish with provenance.

From the publishing branch, run the complete checks and prepare the release
directories:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
bun run test
bun run release:prepare
```

Change only the generated, ignored manifests to the bootstrap version:

```sh
npm pkg set version=0.0.0 --prefix .release/packages/hono-file-router
npm pkg set version=0.0.0 --prefix .release/packages/hono-mdx-renderer
npm pkg set version=0.0.0 --prefix .release/packages/hono-rsc-renderer
```

Inspect and publish each generated package explicitly:

```sh
npm pack --dry-run ./.release/packages/hono-file-router
npm publish ./.release/packages/hono-file-router --access public --tag bootstrap

npm pack --dry-run ./.release/packages/hono-mdx-renderer
npm publish ./.release/packages/hono-mdx-renderer --access public --tag bootstrap

npm pack --dry-run ./.release/packages/hono-rsc-renderer
npm publish ./.release/packages/hono-rsc-renderer --access public --tag bootstrap
```

Do not publish the source package directories directly. Their exports are for
workspace development and intentionally point at `src`.

## Configure npm Trusted Publishing

Open the settings page for each package on npm and add the same GitHub Actions
Trusted Publisher:

| Field | Value |
| --- | --- |
| Organization or user | `yoshikouki` |
| Repository | `hono-kit` |
| Workflow filename | `publish.yml` |
| Environment name | `npm-publish` |
| Allowed action | `npm publish` |

Configure all three packages:

- `@yoshikouki/hono-file-router`
- `@yoshikouki/hono-mdx-renderer`
- `@yoshikouki/hono-rsc-renderer`

The GitHub `npm-publish` environment is restricted to the `main` branch. After
all three npm settings exist, merge the publishing pull request. Its `main`
push publishes `0.1.0-beta.0` through OIDC and attaches npm provenance.

After the workflow succeeds, set every package to require 2FA and disallow
token publishing, deprecate the bootstrap versions, and remove the Raspberry
Pi login session:

```sh
npm deprecate @yoshikouki/hono-file-router@0.0.0 "Bootstrap only; use @beta."
npm deprecate @yoshikouki/hono-mdx-renderer@0.0.0 "Bootstrap only; use @beta."
npm deprecate @yoshikouki/hono-rsc-renderer@0.0.0 "Bootstrap only; use @beta."
npm logout
```

## Routine release

1. Update every changed package to a new version in its pull request.
2. Merge the pull request after CI passes.
3. The `Publish packages` workflow verifies, packs, and publishes the missing
   versions automatically.
4. Confirm the npm version, dist-tag, and provenance link.

Use the workflow's manual dispatch only to retry an interrupted release. It
does not create new versions.
