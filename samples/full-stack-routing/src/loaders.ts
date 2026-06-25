interface MdxModule {
  default: () => string;
}

export function compileMdxRoute(source: string): MdxModule {
  const heading =
    source
      .split("\n")
      .find((line) => line.startsWith("# "))
      ?.slice(2)
      .trim() || "MDX";

  return {
    default: () => `<article><h1>${heading}</h1></article>`,
  };
}
