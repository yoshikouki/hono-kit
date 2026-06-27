# file-router-basic

Basic consumer sample for `@yoshikouki/hono-file-router`.

The sample uses `createFileRouter({ sources })` with an explicit module map.
Each route file under `src/routes` default exports a Hono router.

It also dogfoods the default path convention and directory inheritance surface:

- `src/routes/docs/(guides)/[...slug].ts` proves route groups are omitted from
  URLs while catch-all params still reach Hono.
- `src/routes/_404.ts` and `src/routes/users/_404.ts` are app-level provider
  conventions built with `findNearestInheritedRouteProvider()`, not hard-coded
  router features.

```sh
bun run test
```
