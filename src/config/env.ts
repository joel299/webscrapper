import { config } from "dotenv";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// Secrets live in one profile-aware global file; local .env remains an override
// for development. Existing process environment variables always win.
config({ path: join(process.env.HERMES_HOME ?? join(homedir(), ".hermes"), ".env") });
config();

export const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  BASIC_AUTH_USER: z.string().default("admin"),
  BASIC_AUTH_PASS: z.string().default("admin"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  SCRAPER_CONCURRENCY: z.coerce.number().default(3),
  SCRAPER_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
  BUSINESS_TIMEZONE: z.string().default("America/Campo_Grande"),
  USER_AGENT_ROTATION: z.coerce.boolean().default(true),
  PROSAS_USER: z.string().default("joel.acosta.quintana@gmail.com"),
  PROSAS_PASS: z.string().default("Dj@7408-2012"),
  SUPABASE_URL: z.string().default("https://fsdszcfkjeavuoinyjas.supabase.co"),
  SUPABASE_ANON_KEY: z.string().default(""),
  SUPABASE_BUCKET: z.string().default("edital"),
  LLM_CHAT_URL: z.string().default("https://omnirouter.iainfinito.com.br/v1/chat/completions"),
  LLM_SEARCH_URL: z.string().default("https://omnirouter.iainfinito.com.br/v1/search"),
  LLM_EMBEDDINGS_URL: z.string().default("https://omnirouter.iainfinito.com.br/v1/embeddings"),
  LLM_RESPONSES_URL: z.string().default("https://omnirouter.iainfinito.com.br/v1/responses"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("antigravity/gemini-3.6-flash-high"),
  ANALYSIS_RATE_LIMIT_MAX: z.coerce.number().int().default(10),
  ANALYSIS_RATE_LIMIT_DURATION_MS: z.coerce.number().int().default(60000),
  ANALYSIS_QUEUE_MAX_WAITING: z.coerce.number().int().min(1).default(10)
});

export const env = envSchema.parse(process.env);
