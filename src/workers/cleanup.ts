import { pool } from "../db/pool.js";
import { deleteObject, listBucket, deleteAnalysisFromSupabase } from "../storage/supabase.js";
import { analysisQueue } from "./queue.js";

// Remove do bucket os arquivos com expiração vencida (7 dias) e limpa os
// metadados correlatos. Também limpa dados de editais marcados para purga.
export async function runCleanup() {
  // 1. Jobs terminais antigos não precisam permanecer no Redis.
  const jobGrace = 7 * 24 * 60 * 60 * 1000;
  const removedCompletedJobs = await analysisQueue.clean(jobGrace, 1000, "completed");
  const removedFailedJobs = await analysisQueue.clean(jobGrace, 1000, "failed");

  // 2. Arquivos hospedados com prazo vencido
  const expired = await pool.query(
    "SELECT storage_path FROM editais_arquivos_hosted WHERE expira_em < now()"
  );
  let removedBucket = 0;
  let removedRows = 0;
  for (const row of expired.rows) {
    const ok = await deleteObject((row.storage_path as string).replace(/^editais\//, ""));
    if (!ok) {
      // tenta com prefixo completo como fallback
      await deleteObject(row.storage_path as string);
    }
    removedBucket++;
  }
  if (expired.rows.length) {
    const res = await pool.query("DELETE FROM editais_arquivos_hosted WHERE expira_em < now()");
    removedRows = res.rowCount ?? 0;
  }

  // 3. Remove editais expirados e todos os dados relacionados.
  const expiredEditais = await pool.query(
    `SELECT id FROM editais
     WHERE (data_fechamento IS NOT NULL AND data_fechamento < CURRENT_DATE - interval '7 days')
        OR (data_fechamento IS NULL AND ultima_coleta_em < now() - interval '7 days')`
  );
  let removedEditais = 0;
  for (const row of expiredEditais.rows) {
    await deleteAnalysisFromSupabase(row.id as string);
    const result = await pool.query("DELETE FROM editais WHERE id = $1", [row.id]);
    removedEditais += result.rowCount ?? 0;
  }

  // 4. Órfãos no bucket sem registro no banco.
  let removedOrphans = 0;
  try {
    const objects = await listBucket("editais/");
    for (const obj of objects) {
      // nome do arquivo
      const name = obj.name.replace(/^editais\//, "");
      const tracked = await pool.query(
        "SELECT 1 FROM editais_arquivos_hosted WHERE storage_path = $1",
        [`editais/${name}`]
      );
      if (tracked.rowCount === 0) {
        const gone = await deleteObject(obj.name);
        if (gone) removedOrphans++;
      }
    }
  } catch {
    // ignore list errors
  }

  console.log(`[cleanup] jobs_completed=${removedCompletedJobs.length} jobs_failed=${removedFailedJobs.length} arquivos_expirados=${expired.rows.length} rows=${removedRows} editais=${removedEditais} orfaos=${removedOrphans}`);
}

// Marca um arquivo como hospedado (chamado após upload no bucket).
async function markHosted(
  editalId: string,
  storagePath: string,
  urlPublica: string,
  urlOriginal: string,
  titulo: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO editais_arquivos_hosted (edital_id, url_original, storage_path, url_publica, titulo, expira_em)
     VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
     ON CONFLICT (storage_path) DO UPDATE SET expira_em = now() + interval '7 days'`,
    [editalId, urlOriginal, storagePath, urlPublica, titulo]
  );
}