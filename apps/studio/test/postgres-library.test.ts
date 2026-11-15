import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresLibraryRepository } from "../lib/library/postgres-repository";
import { migrateLibrary } from "../lib/library/postgres-schema";
import { book, libraryContract } from "./library-contract";

/**
 * PostgreSQL tests run against a real server when TEST_DATABASE_URL is set, e.g. with
 *   docker run -d --name vgf-test-db -e POSTGRES_PASSWORD=test -p 127.0.0.1:5433:5432 postgres:16-alpine
 *   TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:5433/postgres pnpm --filter @vipgroup/studio test
 * and are skipped otherwise. They work in their own schema, emptied before each test.
 */
const url = process.env.TEST_DATABASE_URL;
const SCHEMA = "vgf_test";

const pools: Pool[] = [];
const openPool = () => {
  const pool = new Pool({ connectionString: url, options: `-c search_path=${SCHEMA}` });
  pools.push(pool);
  return pool;
};
let pool: Pool;

async function freshSchema(): Promise<void> {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await pool.query(`CREATE SCHEMA ${SCHEMA}`);
  await migrateLibrary(pool);
}

beforeAll(() => {
  if (url) pool = openPool();
});

afterAll(async () => {
  await Promise.all(pools.map((p) => p.end()));
});

libraryContract(
  "PostgreSQL",
  async (newId) => {
    await freshSchema();
    return {
      repo: new PostgresLibraryRepository(pool, { newId }),
      // Its own connection pool, like a second studio process.
      second: (otherId) => new PostgresLibraryRepository(openPool(), { newId: otherId }),
    };
  },
  { skip: !url },
);

describe.skipIf(!url)("PostgreSQL only", () => {
  let work: string;

  beforeEach(async () => {
    await freshSchema();
    work = await mkdtemp(path.join(tmpdir(), "vgf-pg-"));
    return () => rm(work, { recursive: true, force: true });
  });

  it("creates the tables once; running the migrations again changes nothing", async () => {
    expect(await migrateLibrary(pool)).toEqual([]);
    const { rows } = await pool.query<{ version: number }>("SELECT version FROM schema_migrations");
    expect(rows.map((row) => row.version)).toEqual([1]);
  });

  it("moves an existing library.json in once, then renames it", async () => {
    const file = path.join(work, "library.json");
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        folders: [
          { id: "f1", name: "Général", art: "aurora", createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "f2", name: "Brochures", art: "ember", createdAt: "2026-01-02T00:00:00.000Z" },
        ],
        books: [
          {
            ...book("b1", "f2", "brochure-ete"),
            pageCount: 10,
            createdAt: "2026-02-01T00:00:00.000Z",
            publishedAt: "2026-02-02T00:00:00.000Z",
          },
        ],
        nextArt: 3,
      }),
    );
    const repo = new PostgresLibraryRepository(pool, { newId: () => "f3" });

    expect(await repo.importJsonLibrary(file)).toEqual({ folders: 2, books: 1 });
    expect((await repo.listFolders()).map((f) => f.name)).toEqual(["Général", "Brochures"]);
    expect(await repo.getBook("b1")).toMatchObject({
      folderId: "f2",
      slug: "brochure-ete",
      pageCount: 10,
      publishedAt: "2026-02-02T00:00:00.000Z",
    });
    // The artwork order goes on where library.json left it.
    expect((await repo.createFolder("Nouveau")).art).toBe("glacier");
    expect(await readdir(work)).toEqual(["library.json.imported"]);
    expect(await repo.importJsonLibrary(file)).toBeNull();
  });

  it("does not import into a library that already has folders", async () => {
    const repo = new PostgresLibraryRepository(pool);
    await repo.listFolders(); // creates Général
    const file = path.join(work, "library.json");
    await writeFile(file, JSON.stringify({ version: 1, folders: [], books: [], nextArt: 0 }));
    expect(await repo.importJsonLibrary(file)).toBeNull();
    expect(await readdir(work)).toEqual(["library.json"]);
  });

  it("rolls a refused change back completely", async () => {
    const repo = new PostgresLibraryRepository(pool);
    const [general] = await repo.listFolders();
    await repo.createBook(book("a", general!.id, "brochure"));
    await expect(repo.createBook(book("b", general!.id, "brochure"))).rejects.toMatchObject({
      code: "SLUG_TAKEN",
      suggestion: "brochure-2",
    });
    expect((await repo.listBooks()).map((b) => b.id)).toEqual(["a"]);
  });
});
