import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">VipGroup Studio</h1>
        <p className="text-lg text-zinc-600">Flipbooks</p>
      </header>
      {/* Temporary link (step 3): step 5 brings the real library here. */}
      <Link href="/dev/books" className="text-blue-700 hover:underline">
        Aperçu des livres convertis →
      </Link>
    </main>
  );
}
