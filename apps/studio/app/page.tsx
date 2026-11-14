import Link from "next/link";
import { flipbookCount } from "../lib/format";
import { getLibrary } from "../lib/services";

export const dynamic = "force-dynamic";

const card = "glass flex min-h-56 flex-col justify-between gap-8 rounded-[28px] p-7";

export default async function HomePage() {
  const books = await (await getLibrary()).listBooks();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 sm:px-8 sm:py-20">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">VipGroup Studio</h1>
        <p className="text-muted-foreground">Outil interne de VIP Group</p>
      </header>
      <div className="grid gap-6 sm:grid-cols-2">
        <Link
          href="/flipbooks"
          className={card + " transition hover:-translate-y-0.5 hover:bg-white/75"}
        >
          <span className="text-2xl font-semibold tracking-tight">Flipbooks</span>
          <span className="flex items-end justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              Brochures PDF en livres à feuilleter
            </span>
            <span className="shrink-0 font-mono text-sm whitespace-nowrap">
              {flipbookCount(books.length)}
            </span>
          </span>
        </Link>
        {/* Module 1 (blogs) comes later: visible, not usable. */}
        <div
          role="link"
          aria-disabled="true"
          aria-label="Blogs (bientôt)"
          className={card + " cursor-not-allowed opacity-60"}
        >
          <span className="flex items-start justify-between gap-4">
            <span className="text-2xl font-semibold tracking-tight">Blogs</span>
            <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white">
              Bientôt
            </span>
          </span>
          <span className="text-sm text-muted-foreground">Relecture des articles de blog</span>
        </div>
      </div>
    </main>
  );
}
