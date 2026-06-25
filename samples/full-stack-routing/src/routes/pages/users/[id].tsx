import type { RscPageProps } from "@yoshikouki/hono-rsc-renderer";

export default function Page({ params }: RscPageProps) {
  return (
    <html lang="en">
      <head>
        <title>{`Profile ${params.id}`}</title>
      </head>
      <body>
        <main>
          <h1>Profile {params.id}</h1>
        </main>
      </body>
    </html>
  );
}
