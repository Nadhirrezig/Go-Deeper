import { notFound } from "next/navigation";
import Link from "next/link";
import { Flipbook } from "@vipgroup/flipbook";
import "@vipgroup/flipbook/styles.css";
import { DeleteBookButton } from "../../../components/books/book-page-actions";
import { BookProgress } from "../../../components/books/book-progress";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { buttonClass } from "../../../components/ui/button";
import { bookFileUrl, formatBytes, formatDate, pageCountLabel } from "../../../lib/format";
import { getLibrary } from "../../../lib/services";

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const repo = await getLibrary();
  const book = await repo.getBook(bookId);
  if (!book) notFound();
  const folder = await repo.getFolder(book.folderId);
  const folderHref = `/flipbooks/folders/${book.folderId}`;

  const details: [string, React.ReactNode][] = [
    ["Titre", book.title],
    [
      "Slug",
      <code key="slug" className="font-mono text-[13px]">
        {book.slug}
      </code>,
    ],
    [
      "Dossier",
      <Link key="folder" href={folderHref} className="underline">
        {folder?.name ?? "—"}
      </Link>,
    ],
    ["Pages", pageCountLabel(book.pageCount)],
    ["Taille sur le disque", formatBytes(book.sizeBytes)],
    ["Ajouté le", formatDate(book.createdAt)],
  ];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-3 py-8 sm:px-8">
      <title>{`${book.title} — VipGroup Studio`}</title>
      <Breadcrumb
        items={[
          { label: "Flipbooks", href: "/flipbooks" },
          { label: folder?.name ?? "Dossier", href: folderHref },
          { label: book.title },
        ]}
      />
      <h1 className="text-3xl font-semibold tracking-tight">{book.title}</h1>

      {book.status === "ready" && <Flipbook manifestUrl={bookFileUrl(book.id, "manifest.json")} />}
      {book.status === "converting" && <BookProgress book={book} />}
      {book.status === "failed" && (
        <p className="glass rounded-3xl p-8 text-danger" role="alert">
          Échec de la conversion : {book.error?.message ?? "erreur inconnue"}
        </p>
      )}

      <section className="glass flex flex-col gap-5 rounded-3xl p-6 sm:flex-row sm:items-start sm:justify-between">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          {book.status === "ready" && (
            <a
              href={bookFileUrl(book.id, "original.pdf")}
              download={`${book.slug}.pdf`}
              className={buttonClass.primary}
            >
              Télécharger le PDF
            </a>
          )}
          <DeleteBookButton book={book} />
        </div>
      </section>
    </main>
  );
}
