import { hostRemoteFile } from "../storage/supabase.js";
import { pool } from "../db/pool.js";

export interface ArquivoParaHospedar {
  url: string;
  titulo: string;
  tipo?: string;
}

export interface ArquivoHospedado extends ArquivoParaHospedar {
  url_publica?: string;
  storage_path?: string;
}

// Baixa binário via sessão autenticada (headers extras, ex: Bearer da fonte) e
// re-hospeda no bucket. Grava metadado de expiração (7 dias) por storage_path.
export async function hospedarArquivos(
  arquivos: ArquivoParaHospedar[],
  extraHeaders: Record<string, string> = {},
  editalId?: string
): Promise<ArquivoHospedado[]> {
  const out: ArquivoHospedado[] = [];
  for (const arq of arquivos) {
    if (!arq.url) {
      out.push({ ...arq });
      continue;
    }
    if (arq.url.includes("/storage/v1/object/public/")) {
      out.push({ ...arq, url_publica: arq.url });
      await recordExpiryByStoragePath(arq.url, arq.url, arq.titulo, editalId);
      continue;
    }
    const ext = arq.url.match(/\.(\w{3,5})(\?|$)/)?.[1] || "pdf";
    const name = `${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
    const stored = await hostRemoteFile(arq.url, name, extraHeaders);
    if (stored) {
      await recordExpiry(stored.storage_path, stored.url_publica, arq.url, arq.titulo, editalId);
      out.push({ ...arq, url: stored.url_publica, url_publica: stored.url_publica, storage_path: stored.storage_path });
    } else {
      out.push({ ...arq });
    }
  }
  return out;
}

async function recordExpiry(storagePath: string, urlPublica: string, urlOriginal: string, titulo: string | null | undefined, editalId?: string): Promise<void> {
  await pool.query(
    `INSERT INTO editais_arquivos_hosted (edital_id, url_original, storage_path, url_publica, titulo, expira_em)
     VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
     ON CONFLICT (storage_path) DO UPDATE SET expira_em = now() + interval '7 days', edital_id = COALESCE($6, editais_arquivos_hosted.edital_id)`,
    [editalId || null, urlOriginal, storagePath, urlPublica, titulo || null, editalId || null]
  );
}

// Quando o arquivo já veio do nosso bucket, registramos (ou renovamos) pelo path extraído da URL pública.
async function recordExpiryByStoragePath(urlPublica: string, urlOriginal: string, titulo: string | null | undefined, editalId?: string): Promise<void> {
  const m = urlPublica.match(/\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return;
  await recordExpiry(m[2], urlPublica, urlOriginal, titulo, editalId);
}