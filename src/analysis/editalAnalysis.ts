import { createHash } from "node:crypto";
import { pool } from "../db/pool.js";
import { getEditalById } from "../db/repositories/editais.js";
import { env } from "../config/env.js";
import { enqueueAnalysis } from "../workers/queue.js";
import { fetchEditalDetail } from "../scrapers/detail.js";
import { upsertAnalysisToSupabase } from "../storage/supabase.js";

const PROMPT_VERSION = "2.0.0";

function cacheKey(edital: any): string {
  return createHash("sha256").update(JSON.stringify({
    id: edital.id, titulo: edital.titulo, descricao: edital.descricao,
    data_fechamento: edital.data_fechamento, valor_texto: edital.valor_texto,
    periodo_texto: edital.periodo_texto, arquivos: edital.arquivos
  }) + PROMPT_VERSION).digest("hex");
}

const FONTE_NOME: Record<string, string> = {
  capta: "Capta",
  prosas: "Prosas",
  pncp: "PNCP — Portal Nacional de Contratações Públicas",
  ligacriativa: "Liga Criativa",
  queridodiario: "Querido Diário",
  comprasgov: "Compras.gov.br"
};

export async function requestAnalysis(editalId: string, tipo = "aderencia") {
  const edital = await getEditalById(editalId);
  if (!edital) throw new Error("Edital não encontrado");
  const key = cacheKey(edital);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    
    // 1. Busca primeiro se JÁ EXISTE qualquer análise concluída para este edital (nunca perde análise pronta)
    const completed = await client.query(
      `SELECT * FROM edital_analises WHERE edital_id=$1 AND tipo=$2 AND status='completed' ORDER BY criado_em DESC LIMIT 1`,
      [editalId, tipo]
    );
    if (completed.rowCount) {
      await client.query("COMMIT");
      return { analysis: completed.rows[0], cached: true };
    }

    // 2. Busca se há análise em andamento ou na fila
    const pending = await client.query(
      `SELECT * FROM edital_analises WHERE edital_id=$1 AND tipo=$2 AND status IN ('running', 'queued') AND expira_em > now() ORDER BY criado_em DESC LIMIT 1`,
      [editalId, tipo]
    );
    if (pending.rowCount) {
      await client.query("COMMIT");
      return { analysis: pending.rows[0], cached: true };
    }

    // 3. Insere nova análise apenas se realmente não existir
    const inserted = await client.query(
      `INSERT INTO edital_analises (edital_id,tipo,status,provider,modelo,prompt_version,cache_key)
       VALUES ($1,$2,'queued','omniroute',$3,$4,$5) RETURNING *`,
      [editalId, tipo, env.LLM_MODEL, PROMPT_VERSION, key]
    );
    await client.query("COMMIT");
    return { analysis: inserted.rows[0], cached: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function buildAnalysisContext(edital: any) {
  let textoCompleto = "";
  if (!edital.arquivos?.length && edital.link_edital) {
    try {
      const detail = await fetchEditalDetail(edital.link_edital);
      textoCompleto = (detail.texto_completo || "").slice(0, 15000);
    } catch {
      textoCompleto = "";
    }
  }
  return JSON.stringify({
    titulo: edital.titulo,
    fonte: FONTE_NOME[edital.fonte] || edital.fonte,
    link_edital: edital.link_edital,
    descricao: edital.descricao,
    texto_completo_da_pagina: textoCompleto,
    data_fechamento: edital.data_fechamento,
    valor: edital.valor_texto,
    periodo: edital.periodo_texto,
    area: edital.area_tematica,
    publico: edital.publico_alvo,
    ods: edital.ods_texto,
    arquivos: edital.arquivos?.map((a: any) => ({ titulo: a.titulo, url: a.url }))
  });
}

const SYSTEM_PROMPT = `Você é um consultor sênior em captação de recursos e análise de editais. Analise SOMENTE os dados fornecidos. Não invente informações. Quando não houver evidência nos dados, use "Não identificado no material disponível". Responda apenas JSON válido.`;

function buildPrompt(source: string) {
  return `Analise o edital abaixo e retorne um JSON com EXATAMENTE estas chaves:

- "resumo": parágrafo objetivo (o que é, quem financia, para quem, valor, prazo).
- "requisitos_obrigatorios": array de ELEGIBILIDADE REAL do proponente — quem pode participar (tipo de organização, porte, território, registro, experiência, contrapartida). NUNCA coloque prazos ou datas aqui. Cada item: {"requisito": "...", "evidencia": "trecho do texto", "fonte": "nome da fonte real (ex: Capta, Prosas, edital oficial) — nunca a palavra descricao ou periodo"}.
- "documentos_necessarios": array de strings com os documentos/formulários exigidos para inscrição. Se não houver evidência: ["Não identificado no material disponível — consultar edital completo no link oficial"].
- "criterios_avaliacao": array com os critérios e pesos de pontuação. Se não houver: ["Não identificado no material disponível"].
- "pontos_atencao": array com riscos, travas e condições (pagamento por resultado, contrapartida, restrições).
- "decisao": objeto {"recomendacao": "Concorrer" | "Concorrer com ressalvas" | "Não recomendado", "justificativa": "...", "proximos_passos": ["ação 1 concreta", "ação 2 concreta", "ação 3 concreta"]}. As ações devem ser operacionais (ex: "Baixar o edital completo no link oficial e extrair os formulários dos anexos", "Validar regularidade do CNPJ e certidões negativas", "Montar orçamento dentro do teto de R$ X").
- "base_projeto_sugerida": objeto {"problema": "...", "objetivo": "...", "publico": "...", "metodologia": "...", "indicadores": "..."} alinhado ao que o edital financia.
- "checklist": array de ações verificáveis e sequenciais para submeter a proposta.

EDITAL:
${source}`;
}

function parseLlmJson(raw: string) {
  const clean = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Resposta da LLM não é JSON válido");
  }
}

export async function runAnalysis(analysisId: string) {
  const row = await pool.query("SELECT * FROM edital_analises WHERE id=$1", [analysisId]);
  if (!row.rowCount) throw new Error("Análise não encontrada");
  const analysis = row.rows[0];
  const edital = await getEditalById(analysis.edital_id);
  if (!edital) throw new Error("Edital não encontrado");
  await pool.query("UPDATE edital_analises SET status='running', atualizado_em=now() WHERE id=$1", [analysisId]);

  const source = await buildAnalysisContext(edital);
  try {
    const llmHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (env.LLM_API_KEY) llmHeaders.Authorization = `Bearer ${env.LLM_API_KEY}`;
    const res = await fetch(env.LLM_CHAT_URL, {
      method: "POST",
      headers: llmHeaders,
      body: JSON.stringify({
        model: env.LLM_MODEL,
        stream: false,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(source) }
        ]
      }),
      signal: AbortSignal.timeout(180000)
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json() as any;
    const raw = body.choices?.[0]?.message?.content || "{}";
    const result = parseLlmJson(raw);
    await pool.query("UPDATE edital_analises SET status='completed', resultado=$1, atualizado_em=now() WHERE id=$2", [JSON.stringify(result), analysisId]);
    void upsertAnalysisToSupabase({
      analysis_id: analysisId,
      edital_id: edital.id,
      edital_titulo: edital.titulo,
      fonte: edital.fonte,
      status: "completed",
      modelo: env.LLM_MODEL,
      resultado: result,
      expira_em: analysis.expira_em
    }).catch(() => {});
  } catch (err: any) {
    await pool.query("UPDATE edital_analises SET status='failed', erro=$1, atualizado_em=now() WHERE id=$2", [String(err?.message || err), analysisId]);
    throw err;
  }
}

export async function enqueuePendingAnalyses(limit = 50) {
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
  const r = await pool.query(
    `SELECT id,tipo,status,modelo,criado_em,atualizado_em,expira_em,resultado,erro
     FROM edital_analises WHERE edital_id=$1 ORDER BY criado_em DESC`,
    [editalId]
  );
  return r.rows;
}
