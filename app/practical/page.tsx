import { content } from "@/lib/content";
import PracticalCatalogLoader from "@/components/PracticalCatalogLoader";

export const metadata = { title: "实操题库" };
export const dynamic = "force-static";

export default function PracticalPage() {
  return <main className="practical-page">
    <link rel="preload" href={`/content/practical-catalog-${encodeURIComponent(content.version)}.json`} as="fetch" />
    <section className="container practical-workspace">
      <PracticalCatalogLoader contentVersion={content.version} />
    </section>
  </main>;
}
