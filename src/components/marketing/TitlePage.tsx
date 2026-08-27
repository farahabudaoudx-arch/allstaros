import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export function TitlePage({ title }: { title: string }) {
  return (
    <main>
      <SiteHeader />
      <section className="title-page"><div className="section"><h1>{title}</h1></div></section>
      <SiteFooter />
    </main>
  );
}
