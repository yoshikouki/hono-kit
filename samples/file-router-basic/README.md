# file-router-basic

Basic consumer sample for `@yoshikouki/hono-file-router`.

The sample uses `createFileRouter({ base: "./routes" })` and the default
convention that `*.ts` files under `src/routes` default export Hono routers.

```sh
bun run test
```
