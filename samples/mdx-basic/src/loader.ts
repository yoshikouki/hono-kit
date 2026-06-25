interface MdxModule {
  default: () => string;
}

export async function loadTextRoute(path: string): Promise<string> {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) {
    throw new Error(`Failed to load route file: ${path}`);
  }
  return response.text();
}

export async function loadMdxRoute(path: string): Promise<MdxModule> {
  const source = await loadTextRoute(path);
  const heading =
    source
      .split("\n")
      .find((line) => line.startsWith("# "))
      ?.slice(2)
      .trim() || "MDX";

  return {
    default: () => `<article>${heading}</article>`,
  };
}
