import { pool } from "../db/pool.js";

export interface ScraperRunMetrics {
  runId?: string;
  pagesScanned?: number;
  itemsSeen?: number;
  itemsInserted?: number;
  itemsUpdated?: number;
  documentsDownloaded?: number;
}

export type ScraperRunStatus = "queued" | "running" | "success" | "partial" | "retrying" | "failed";

export async function startScraperRun(source: string, runId?: string): Promise<number> {
  const result = await pool.query(
    "INSERT INTO scraper_runs (source, status, run_id, started_at) VALUES ($1, 'running', $2, now()) RETURNING id",
    [source, runId || null]
  );
  return Number(result.rows[0].id);
}

export async function finishScraperRun(id: number, status: Exclude<ScraperRunStatus, "queued" | "running" | "retrying">, metrics: ScraperRunMetrics = {}, errorMessage: string | null = null) {
  await pool.query(
    `UPDATE scraper_runs SET status=$1, persisted_count=$2, items_inserted=$3, items_updated=$4,
      pages_scanned=$5, items_seen=$6, documents_downloaded=$7, error_message=$8,
      finished_at=now(), last_success_at=CASE WHEN $1 IN ('success','completed') THEN now() ELSE last_success_at END
     WHERE id=$9`,
    [status, metrics.itemsInserted || 0, metrics.itemsInserted || 0, metrics.itemsUpdated || 0,
      metrics.pagesScanned || 0, metrics.itemsSeen || 0, metrics.documentsDownloaded || 0,
      errorMessage, id]
  );
}
