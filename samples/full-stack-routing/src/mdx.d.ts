declare module "*.md" {
  import type { ComponentType } from "react";

  const Content: ComponentType<Record<string, unknown>>;
  export const frontmatter: Readonly<Record<string, unknown>>;
  export default Content;
}

declare module "*.mdx" {
  import type { ComponentType } from "react";

  const Content: ComponentType<Record<string, unknown>>;
  export const frontmatter: Readonly<Record<string, unknown>>;
  export default Content;
}
