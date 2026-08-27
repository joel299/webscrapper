import { pool } from "../db/pool.js";

export type ScraperRunStatus = "running" | "completed" | "failed";

export async function startScraperRun(source: string): Promise<number> {
  const result = await pool.query("INSERT INTO scraper_runs (source, status, started_at) VALUES ($1, 'running', now()) RETURNING id", [source]);
  return Number(result.rows[0].id);
}

export async function finishScraperRun(id: number, status: Exclude<ScraperRunStatus, "running">, persistedCount = 0, errorMessage: string | null = null) {
  await pool.query("UPDATE scraper_runs SET status=$1, persisted_count=$2, error_message=$3, finished_at=now() WHERE id=$4", [status, persistedCount, errorMessage, id]);
}
