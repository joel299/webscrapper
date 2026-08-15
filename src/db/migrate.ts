import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool.js";

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(process.cwd(), "src", "db", "migrations");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await pool.query(sql);
  }
}

// Executa migrações e encerra a pool (uso via CLI: npm run migrate)
if (process.argv[1]?.endsWith("migrate.js")) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
