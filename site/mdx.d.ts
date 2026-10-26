// Docs pages in content/docs export their metadata alongside the content.
declare module "*.mdx" {
  export const meta: { title: string; description: string; order: number };
}
