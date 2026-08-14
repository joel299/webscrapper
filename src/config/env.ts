import { config } from "dotenv";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// Secrets live in one profile-aware global file; local .env remains an override
// for development. Existing process environment variables always win.
config({ path: join(process.env.HERMES_HOME ?? join(homedir(), ".hermes"), ".env") });
config();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  BASIC_AUTH_USER: z.string().default("admin"),
  BASIC_AUTH_PASS: z.string().default("admin"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  SCRAPER_CONCURRENCY: z.coerce.number().default(3),
  USER_AGENT_ROTATION: z.coerce.boolean().default(true)
});

export const env = envSchema.parse(process.env);
