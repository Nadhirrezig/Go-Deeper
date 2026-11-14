import { notFound } from "next/navigation";
import { FolderView } from "../../../../components/folders/folder-view";
import { getLibrary } from "../../../../lib/services";
import { maxUploadBytes } from "../../../../lib/upload";

export const dynamic = "force-dynamic";

export default async function FolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  const repo = await getLibrary();
  const [folder, folders, books] = await Promise.all([
    repo.getFolder(folderId),
    repo.listFolders(),
    repo.listBooks({ folderId }),
  ]);
  if (!folder) notFound();
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-8">
      <title>{`${folder.name} — VipGroup Studio`}</title>
      <FolderView
        folder={folder}
        books={books}
        isLastFolder={folders.length <= 1}
        maxUploadMb={maxUploadBytes() / 1024 / 1024}
      />
    </main>
  );
}
