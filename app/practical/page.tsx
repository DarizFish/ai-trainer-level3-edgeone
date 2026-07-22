import { content } from "@/lib/content";
import PracticalCatalog from "@/components/PracticalCatalog";

export const metadata = { title: "实操题库" };

export default async function PracticalPage({ searchParams }: { searchParams: Promise<{ lab?: string }> }) {
  const query = await searchParams;
  return <main className="practical-page">
    <section className="container practical-workspace"><PracticalCatalog tasks={content.practical} initialLabOnly={query.lab === "1"} /></section>
  </main>;
}
