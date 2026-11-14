import { Flipbook } from "@vipgroup/flipbook";
import "@vipgroup/flipbook/styles.css";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-bold">VipGroup Studio</h1>
        <p className="text-lg text-zinc-600">Flipbooks</p>
      </header>
      <Flipbook />
    </main>
  );
}
