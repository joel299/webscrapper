import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { getEditalById } from "../db/repositories/editais.js";
import { env } from "../config/env.js";
import { enqueueAnalysis } from "../workers/queue.js";

const PROMPT_VERSION = "1.0.0";

function cacheKey(edital: any): string {
  return createHash("sha256").update(JSON.stringify({
    id: edital.id, titulo: edital.titulo, descricao: edital.descricao,
    data_fechamento: edital.data_fechamento, valor_texto: edital.valor_texto,
    periodo_texto: edital.periodo_texto, arquivos: edital.arquivos
  }) + PROMPT_VERSION).digest("hex");
}

export async function requestAnalysis(editalId: string, tipo = "aderencia") {
  const edital = await getEditalById(editalId);
  if (!edital) throw new Error("Edital não encontrado");
  const key = cacheKey(edital);
  const cached = await pool.query(
    `SELECT * FROM edital_analises WHERE edital_id=$1 AND tipo=$2 AND cache_key=$3 AND expira_em > now() ORDER BY criado_em DESC LIMIT 1`,
    [editalId, tipo, key]
  );
  if (cached.rowCount) return { analysis: cached.rows[0], cached: ["completed", "running"].includes(cached.rows[0].status) };
  const inserted = await pool.query(
    `INSERT INTO edital_analises (edital_id,tipo,status,provider,modelo,prompt_version,cache_key)
     VALUES ($1,$2,'queued','omniroute',$3,$4,$5) RETURNING *`,
    [editalId, tipo, env.LLM_MODEL, PROMPT_VERSION, key]
  );
  return { analysis: inserted.rows[0], cached: false };
}

export async function runAnalysis(analysisId: string) {
  const row = await pool.query("SELECT * FROM edital_analises WHERE id=$1", [analysisId]);
  if (!row.rowCount) throw new Error("Análise não encontrada");
  const analysis = row.rows[0];
  const edital = await getEditalById(analysis.edital_id);
  if (!edital) throw new Error("Edital não encontrado");
  await pool.query("UPDATE edital_analises SET status='running', atualizado_em=now() WHERE id=$1", [analysisId]);
  const source = JSON.stringify({
    titulo: edital.titulo, fonte: edital.fonte, descricao: edital.descricao,
    data_fechamento: edital.data_fechamento, valor: edital.valor_texto,
    periodo: edital.periodo_texto, area: edital.area_tematica,
    publico: edital.publico_alvo, ods: edital.ods_texto,
    arquivos: edital.arquivos?.map((a: any) => ({ titulo: a.titulo, url: a.url }))
  });
  const prompt = `Você é um analista de editais. Analise SOMENTE os dados fornecidos. Não invente requisitos. Quando não houver evidência, use "Não identificado". Retorne JSON válido com: resumo, requisitos_obrigatorios[], documentos_necessarios[], criterios_avaliacao[], pontos_atencao[], base_projeto_sugerida{problema,objetivo,publico,metodologia,indicadores}, checklist[]. Cada requisito deve ter evidencia e fonte.\n\nEDITAL:\n${source}`;
  try {
    const llmHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (env.LLM_API_KEY) llmHeaders.Authorization = `Bearer ${env.LLM_API_KEY}`;
    const res = await fetch(env.LLM_CHAT_URL, {
      method: "POST",
      headers: llmHeaders,
      body: JSON.stringify({ model: env.LLM_MODEL, stream: false, temperature: 0.1, messages: [{ role: "system", content: "Responda apenas JSON válido." }, { role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(120000)
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json() as any;
    const raw = body.choices?.[0]?.message?.content || "{}";
    const clean = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(clean);
    await pool.query("UPDATE edital_analises SET status='completed', resultado=$1, atualizado_em=now() WHERE id=$2", [JSON.stringify(result), analysisId]);
  } catch (err: any) {
    await pool.query("UPDATE edital_analises SET status='failed', erro=$1, atualizado_em=now() WHERE id=$2", [String(err?.message || err), analysisId]);
    throw err;
  }
}

export async function enqueuePendingAnalyses(limit = 20) {
  const rows = await pool.query(
    `SELECT e.id FROM editais e
     WHERE NOT EXISTS (
       SELECT 1 FROM edital_analises a
       WHERE a.edital_id=e.id AND a.tipo='aderencia'
         AND a.status IN ('queued','running','completed') AND a.expira_em > now()
     )
     ORDER BY e.atualizado_em DESC NULLS LAST, e.criado_em DESC LIMIT $1`,
    [limit]
  );
  let queued = 0;
  for (const row of rows.rows) {
    const { analysis, cached } = await requestAnalysis(row.id, "aderencia");
    if (!cached) { await enqueueAnalysis(analysis.id); queued++; }
  }
  return queued;
}

export async function listAnalyses(editalId: string) {
  const r = await pool.query("SELECT id,tipo,status,modelo,criado_em,atualizado_em,expira_em,resultado,erro FROM edital_analises WHERE edital_id=$1 ORDER BY criado_em DESC", [editalId]);
  return r.rows;
}