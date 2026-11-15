import type { Pool } from "pg";

/**
 * The library's tables, created or brought up to date when the studio starts. Each migration
 * runs once, in order, inside a transaction; a lock keeps two starting studios from racing.
 * Append new migrations; never edit one that has shipped.
 */
const MIGRATIONS: readonly { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE folders (
        id text PRIMARY KEY,
        name text NOT NULL,
        art text NOT NULL,
        created_at text NOT NULL,
        -- Creation order: folders are listed oldest first, as library.json kept them.
        seq bigserial NOT NULL
      );
      CREATE TABLE books (
        id text PRIMARY KEY,
        folder_id text NOT NULL REFERENCES folders (id),
        slug text NOT NULL UNIQUE,
        -- The whole BookRecord; the columns above repeat what constraints and lookups need.
        record jsonb NOT NULL
      );
      CREATE INDEX books_folder_id ON books (folder_id);
      -- How many folders were ever created: the next one gets ART_PRESET_ORDER[next_art % 5].
      CREATE TABLE library_state (
        id integer PRIMARY KEY CHECK (id = 1),
        next_art integer NOT NULL
      );
      INSERT INTO library_state (id, next_art) VALUES (1, 0);
    `,
  },
];

/** Advisory lock key shared by migrations and every library change (see the repository). */
export const LIBRARY_LOCK = 4_101_975;

export async function migrateLibrary(pool: Pool): Promise<number[]> {
  const client = await pool.connect();
  const applied: number[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LIBRARY_LOCK]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version integer PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ version: number }>(
      "SELECT version FROM schema_migrations",
    );
    const done = new Set(rows.map((row) => row.version));
    for (const migration of MIGRATIONS) {
      if (done.has(migration.version)) continue;
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [
        migration.version,
      ]);
      applied.push(migration.version);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
