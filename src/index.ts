import { env } from "./config/env.js";
import { buildServer } from "./api/server.js";
import { runMigrations } from "./db/migrate.js";

// Garante o schema (tabelas/colunas) antes de subir o servidor.
await runMigrations();

const app = await buildServer();

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
