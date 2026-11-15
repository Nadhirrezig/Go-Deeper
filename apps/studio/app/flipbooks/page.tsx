import { FolderGrid } from "../../components/folders/folder-grid";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { getLibrary } from "../../lib/services";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flipbooks — VipGroup Studio" };

export default async function FlipbooksPage() {
  const repo = await getLibrary();
  const [folders, books] = await Promise.all([repo.listFolders(), repo.listBooks()]);
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 sm:px-8">
      <Breadcrumb items={[{ label: "Studio", href: "/" }, { label: "Flipbooks" }]} />
      <h1 className="text-3xl font-semibold tracking-tight">Flipbooks</h1>
      <FolderGrid folders={folders} books={books} />
    </main>
  );
}
