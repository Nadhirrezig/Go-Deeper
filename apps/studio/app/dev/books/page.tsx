// TEMPORARY preview (step 3): lists the books found in ./storage/flipbooks.
// Step 5 replaces this page with the real studio library.
import Link from "next/link";
import { listBooks } from "../../../lib/flipbooks-storage";

export const dynamic = "force-dynamic";

export const metadata = { title: "Aperçu des livres — VipGroup Studio" };

export default async function DevBooksPage() {
  const books = await listBooks();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-2xl font-bold">Aperçu des livres</h1>
        <p className="text-sm text-zinc-600">
          Page temporaire : livres trouvés dans <code>storage/flipbooks</code>.
        </p>
      </header>
      {books.length === 0 ? (
        <p>
          Aucun livre. Convertissez un PDF avec <code>pnpm convert fichier.pdf</code>.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          {books.map((book) => (
            <li key={book.id}>
              <Link
                href={`/dev/books/${book.id}`}
                className="flex items-baseline justify-between gap-4 p-4 hover:bg-zinc-50"
              >
                <span className="font-medium">{book.title}</span>
                <span className="shrink-0 text-sm text-zinc-600">
                  {book.pageCount} pages ·{" "}
                  {new Date(book.createdAt).toLocaleString("fr-FR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
