import { DocsSidebar } from "@/components/site/docs-sidebar";
import { Footer } from "@/components/site/footer";
import { Nav } from "@/components/site/nav";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <>
      <Nav />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 pt-8 pb-24 md:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14 lg:pt-14">
        <DocsSidebar />
        <main className="min-w-0">{children}</main>
      </div>
      <Footer />
    </>
  );
}
