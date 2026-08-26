import { pool } from "../pool.js";
import { TECHNOLOGY_QUERIES } from "../../config/searchQueries.js";

export interface EditalRichItem {
  titulo: string;
  link: string;
  status?: string | null;
  data_fechamento?: string | Date | null;
  descricao?: string | null;
  link_pdf?: string | null;
  valorTexto?: string | null;
  periodoTexto?: string | null;
  areaTematica?: string | null;
  publicoAlvo?: string | null;
  odsTexto?: string | null;
  whatsapp?: string | null;
  siteOficial?: string | null;
  arquivos?: Array<EditalDocument>;
  externalId?: string;
  canonicalKey?: string;
  sourceType?: string;
  contentHash?: string;
  documentsStatus?: string;
  numeroEdital?: string;
  numeroProcesso?: string;
  orgao?: string;
  municipio?: string;
  estado?: string;
  modalidade?: string;
  tipoJulgamento?: string;
  tipoDisputa?: string;
  pregoeiro?: string;
  legislacao?: string;
  inicioEnvioPropostas?: string;
  fimEnvioPropostas?: string;
  aberturaLicitacao?: string;
  andamento?: string;
}

export interface EditalDocument {
  nome?: string;
  tipo: string;
  data_publicacao?: string;
  url_origem?: string;
  mime_type?: string;
  tamanho_bytes?: number;
  sha256?: string;
  status_download?: string;
  texto_extraido?: string;
  erro?: string;
  url?: string;
  titulo?: string;
}

// Títulos/ruído de itens que não são editais/licitações reais
const NON_EDITAL_TITLES = [
  "acessar", "saiba mais", "leia mais", "veja mais", "contato", "cadastre-se",
  "oportunidades", "portais e editais abertos", "oportunidades e editais", "início"
];

function tokenizeTexto(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/\s+OR\s+|\s+\|\s+|\s*,\s*|\s+/i)
    .map((t) => t.replace(/^[\("]+|[\("]+$/g, "").trim())
    .filter((t) => t.length > 1);
}

export async function listEditais(filters: Record<string, unknown>) {
  const page = Number(filters.page ?? 1);
  const limit = Number(filters.limit ?? 20);
  const offset = (page - 1) * limit;
  const values: Array<string | number> = [];
  const conditions: string[] = [];

  const addFilter = (value: unknown, expression: string) => {
    if (typeof value !== "string" || !value.trim()) return;
    values.push(`%${value.trim()}%`);
    conditions.push(expression.replaceAll("$VALUE", `$${values.length}`));
  };

  addFilter(filters.fonte, "e.fonte ILIKE $VALUE");
  addFilter(filters.status, "e.status ILIKE $VALUE");

  // Fonte configurada por id de query pronta da planilha (?modo=software|ia|nuvem|...)
  const modo = typeof filters.modo === "string" ? filters.modo : "";
  if (modo) {
    const q = TECHNOLOGY_QUERIES.find((q) => q.id === modo);
    if (q && q.terms.length) {
      const termSql: string[] = [];
      for (const t of q.terms) {
        values.push(`%${t}%`);
        termSql.push(`(e.titulo ILIKE $${values.length} OR e.descricao ILIKE $${values.length} OR e.area_tematica ILIKE $${values.length})`);
      }
      conditions.push(`(${termSql.join(" OR ")})`);
    }
  } else if (typeof filters.texto === "string" && filters.texto.trim()) {
    const terms = tokenizeTexto(filters.texto);
    if (terms.length) {
      const termSql: string[] = [];
      for (const t of terms) {
        values.push(`%${t}%`);
        termSql.push(`(e.titulo ILIKE $${values.length} OR e.descricao ILIKE $${values.length} OR e.area_tematica ILIKE $${values.length} OR e.publico_alvo ILIKE $${values.length})`);
      }
      conditions.push(`(${termSql.join(" OR ")})`);
    }
  }

  if (typeof filters.data_fechamento_inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(filters.data_fechamento_inicio)) {
    values.push(filters.data_fechamento_inicio);
    conditions.push(`e.data_fechamento >= $${values.length}`);
  }

  // Força retorno de licitações reais: exclui títulos genéricos/não-editais
  const noise: string[] = [];
  for (const t of NON_EDITAL_TITLES) {
    values.push(`%${t}%`);
    noise.push(`LOWER(e.titulo) LIKE $${values.length}`);
  }
  conditions.push(`NOT (${noise.join(" OR ")})`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  values.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT e.id, e.titulo, e.fonte, e.status, e.data_fechamento, e.link_edital, e.link_pdf, e.descricao,
            e.valor_texto, e.periodo_texto, e.area_tematica, e.publico_alvo, e.ods_texto, e.whatsapp, e.site_oficial,
            a.status AS analysis_status, a.id AS analysis_id
     FROM editais e
     LEFT JOIN LATERAL (
       SELECT status, id FROM edital_analises
       WHERE edital_id = e.id AND tipo = 'aderencia' AND expira_em > now()
       ORDER BY CASE status WHEN 'completed' THEN 0 WHEN 'running' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END, criado_em DESC
       LIMIT 1
     ) a ON true
     ${where}
     ORDER BY e.data_fechamento DESC NULLS LAST LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values
  );

  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM editais e ${where}`, values.slice(0, -2));
  return { total: count.rows[0]?.total ?? 0, items: rows };
}

export async function listEditalSources() {
  const { rows } = await pool.query(
    "SELECT DISTINCT fonte FROM editais WHERE fonte IS NOT NULL AND fonte <> '' ORDER BY fonte"
  );
  return rows.map((row) => row.fonte as string);
}

export async function getEditalById(id: string) {
  const edital = await pool.query(
    "SELECT * FROM editais WHERE id = $1",
    [id]
  );

  if (edital.rowCount === 0) return null;

  const contatos = await pool.query(
    "SELECT email, telefone, celular FROM editais_contatos WHERE edital_id = $1",
    [id]
  );

  const arquivos = await pool.query(
    "SELECT id, tipo, url, titulo FROM editais_arquivos WHERE edital_id = $1 ORDER BY criado_em",
    [id]
  );

  return {
    ...edital.rows[0],
    contatos: {
      email: contatos.rows.map((row) => row.email).filter(Boolean),
      telefone: contatos.rows.map((row) => row.telefone).filter(Boolean),
      celular: contatos.rows.map((row) => row.celular).filter(Boolean)
    },
    arquivos: arquivos.rows
  };
}

function normalizeDate(raw: string | Date | null | undefined): string | null {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString().split("T")[0];
  const d = String(raw).trim();
  const br = d.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.substring(0, 10);
  return null;
}

export async function upsertEditaisFromList(fonte: string, items: EditalRichItem[]) {
  if (items.length === 0) return { inserted: 0 };

  const values: Array<string | null> = [];
  const placeholders: string[] = [];
  let validCount = 0;

  items.forEach((item) => {
    const rawTitle = (item.titulo || "").trim();
    if (!rawTitle || /^acessar$/i.test(rawTitle) || /^saiba mais$/i.test(rawTitle) || /^leia mais$/i.test(rawTitle)) {
      return;
    }
    if (!item.link) return;

    const data_fechamento = normalizeDate(item.data_fechamento);

    const base = validCount * 35;
    values.push(
      fonte,
      rawTitle,
      item.link,
      item.status?.trim() || "Aberto",
      data_fechamento,
      item.descricao?.trim() || null,
      item.valorTexto?.trim() || null,
      item.periodoTexto?.trim() || null,
      item.areaTematica?.trim() || null,
      item.publicoAlvo?.trim() || null,
      item.odsTexto?.trim() || null,
      item.whatsapp?.trim() || null,
      item.siteOficial?.trim() || null,
      item.link_pdf?.trim() || null,
      item.externalId || null, item.canonicalKey || null, fonte, item.sourceType || null, item.contentHash || null,
      item.documentsStatus || null, item.numeroEdital || null, item.numeroProcesso || null, item.orgao || null,
      item.municipio || null, item.estado || null, item.modalidade || null, item.tipoJulgamento || null,
      item.tipoDisputa || null, item.pregoeiro || null, item.legislacao || null, item.inicioEnvioPropostas || null,
      item.fimEnvioPropostas || null, item.aberturaLicitacao || null, item.andamento || null
    );
    placeholders.push(`(${Array.from({ length: 35 }, (_, i) => `$${base + i + 1}`).join(", ")})`);
    validCount++;
  });

  if (validCount === 0) return { inserted: 0 };

  const query = `
    INSERT INTO editais (fonte, titulo, link_edital, status, data_fechamento, descricao,
                         valor_texto, periodo_texto, area_tematica, publico_alvo, ods_texto,
                         whatsapp, site_oficial, link_pdf, external_id, canonical_key, source_code, source_type,
                         content_hash, documents_status, analysis_status, numero_edital, numero_processo, orgao,
                         municipio, estado, modalidade, tipo_julgamento, tipo_disputa, pregoeiro, legislacao,
                         inicio_envio_propostas, fim_envio_propostas, abertura_licitacao, andamento)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (link_edital) DO UPDATE SET
      titulo = EXCLUDED.titulo,
      status = COALESCE(EXCLUDED.status, editais.status),
      data_fechamento = COALESCE(EXCLUDED.data_fechamento, editais.data_fechamento),
      descricao = COALESCE(EXCLUDED.descricao, editais.descricao),
      valor_texto = COALESCE(EXCLUDED.valor_texto, editais.valor_texto),
      periodo_texto = COALESCE(EXCLUDED.periodo_texto, editais.periodo_texto),
      area_tematica = COALESCE(EXCLUDED.area_tematica, editais.area_tematica),
      publico_alvo = COALESCE(EXCLUDED.publico_alvo, editais.publico_alvo),
      ods_texto = COALESCE(EXCLUDED.ods_texto, editais.ods_texto),
      whatsapp = COALESCE(EXCLUDED.whatsapp, editais.whatsapp),
      site_oficial = COALESCE(EXCLUDED.site_oficial, editais.site_oficial),
      link_pdf = COALESCE(EXCLUDED.link_pdf, editais.link_pdf),
      external_id = COALESCE(EXCLUDED.external_id, editais.external_id), canonical_key = COALESCE(EXCLUDED.canonical_key, editais.canonical_key),
      source_code = COALESCE(EXCLUDED.source_code, editais.source_code), source_type = COALESCE(EXCLUDED.source_type, editais.source_type),
      content_hash = COALESCE(EXCLUDED.content_hash, editais.content_hash), documents_status = COALESCE(EXCLUDED.documents_status, editais.documents_status),
      analysis_status = COALESCE(EXCLUDED.analysis_status, editais.analysis_status), numero_edital = COALESCE(EXCLUDED.numero_edital, editais.numero_edital),
      numero_processo = COALESCE(EXCLUDED.numero_processo, editais.numero_processo), orgao = COALESCE(EXCLUDED.orgao, editais.orgao),
      municipio = COALESCE(EXCLUDED.municipio, editais.municipio), estado = COALESCE(EXCLUDED.estado, editais.estado), modalidade = COALESCE(EXCLUDED.modalidade, editais.modalidade),
      tipo_julgamento = COALESCE(EXCLUDED.tipo_julgamento, editais.tipo_julgamento), tipo_disputa = COALESCE(EXCLUDED.tipo_disputa, editais.tipo_disputa),
      pregoeiro = COALESCE(EXCLUDED.pregoeiro, editais.pregoeiro), legislacao = COALESCE(EXCLUDED.legislacao, editais.legislacao),
      inicio_envio_propostas = COALESCE(EXCLUDED.inicio_envio_propostas, editais.inicio_envio_propostas), fim_envio_propostas = COALESCE(EXCLUDED.fim_envio_propostas, editais.fim_envio_propostas),
      abertura_licitacao = COALESCE(EXCLUDED.abertura_licitacao, editais.abertura_licitacao), andamento = COALESCE(EXCLUDED.andamento, editais.andamento),
      ultima_coleta_em = now()
    RETURNING id
  `;

  const result = await pool.query(query, values);

  // Persist attachments for newly inserted rows
  const insertedIds = (result.rows ?? []).map((row) => row.id as string);
  if (insertedIds.length) {
    for (const item of items.filter((i) => i.arquivos && i.arquivos.length)) {
      const match = insertedIds;
      if (!match.length) continue;
      // Simple mapping: attach to the first inserted id; conflicts updated, so re-insert guarded.
      // Use a link match instead: find the id via link.
      const linkResult = await pool.query("SELECT id FROM editais WHERE link_edital = $1", [item.link]);
      if (!linkResult.rowCount) continue;
      const editalId = linkResult.rows[0].id;
      for (const a of item.arquivos ?? []) {
        await pool.query(
          `INSERT INTO editais_arquivos (edital_id, tipo, url, titulo, data_publicacao, url_origem, mime_type, tamanho_bytes, sha256, status_download, texto_extraido, erro)
           VALUES ($1, $2, $3, $4, $5, $3, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (edital_id, url) DO UPDATE SET
             tipo = EXCLUDED.tipo, titulo = EXCLUDED.titulo, data_publicacao = EXCLUDED.data_publicacao,
             url_origem = EXCLUDED.url_origem, mime_type = EXCLUDED.mime_type, tamanho_bytes = EXCLUDED.tamanho_bytes,
             sha256 = EXCLUDED.sha256, status_download = EXCLUDED.status_download, texto_extraido = EXCLUDED.texto_extraido,
             erro = EXCLUDED.erro`,
          [editalId, a.tipo || "Outro", a.url || a.url_origem || null, a.titulo || a.nome || null, a.data_publicacao || null, a.mime_type || null, a.tamanho_bytes || null, a.sha256 || null, a.status_download || null, a.texto_extraido || null, a.erro || null]
        );
      }
    }
  }

  return { inserted: result.rowCount ?? 0 };
}