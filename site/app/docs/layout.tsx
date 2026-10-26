import { DocsSidebar } from "@/components/site/docs-sidebar";
import { Footer } from "@/components/site/footer";
import { Nav } from "@/components/site/nav";
import { searchIndex } from "@/lib/docs-index";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <>
      <Nav />
      <div className="mx-auto grid w-full max-w-7xl flex-1 px-4 pb-24 md:px-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10 xl:gap-12">
        <DocsSidebar index={searchIndex()} />
        <main className="min-w-0 pt-8 lg:pt-10">{children}</main>
      </div>
      <Footer />
    </>
  );
}
