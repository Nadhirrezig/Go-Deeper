// TEMPORARY preview (step 3): shows one book from ./storage/flipbooks in the reader.
// Step 5 replaces this page with the real studio preview.
import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flipbook } from "@vipgroup/flipbook";
import "@vipgroup/flipbook/styles.css";
import { getStorageDir, isSafeSegment } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

export default async function DevBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (
    !isSafeSegment(id) ||
    !existsSync(/*turbopackIgnore: true*/ path.join(getStorageDir(), id, "manifest.json"))
  ) {
    notFound();
  }
  return (
    <main className="flex flex-col gap-3 p-3">
      <Link href="/dev/books" className="text-sm text-zinc-600 hover:underline">
        ← Tous les livres
      </Link>
      <Flipbook manifestUrl={`/files/${id}/manifest.json`} />
    </main>
  );
}
