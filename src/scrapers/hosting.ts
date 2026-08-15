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
// re-hospeda no bucket. Retorna a lista com url pública substituída quando possível.
export async function hospedarArquivos(
  editalId: string,
  arquivos: ArquivoParaHospedar[],
  extraHeaders: Record<string, string> = {}
): Promise<ArquivoHospedado[]> {
  const out: ArquivoHospedado[] = [];
  for (const arq of arquivos) {
    if (!arq.url) {
      out.push({ ...arq });
      continue;
    }
    // já hospedado (nosso bucket)?
    if (arq.url.includes("/storage/v1/object/public/")) {
      out.push({ ...arq, url_publica: arq.url });
      continue;
    }
    const ext = arq.url.match(/\.(\w{2,5})(\?|$)/)?.[1] || "pdf";
    const name = `${editalId.slice(0, 8)}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
    const stored = await hostRemoteFile(arq.url, name, extraHeaders, arq.url.startsWith("data:") ? "application/octet-stream" : "application/pdf");
    if (stored) {
      // guarda metadado de expiração (7 dias)
      await pool.query(
        `INSERT INTO editais_arquivos_hosted (edital_id, url_original, storage_path, url_publica, titulo, expira_em)
         VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
         ON CONFLICT (storage_path) DO UPDATE SET expira_em = now() + interval '7 days'`,
        [editalId, arq.url, stored.storage_path, stored.url_publica, arq.titulo || null]
      );
      out.push({ ...arq, url: stored.url_publica, url_publica: stored.url_publica, storage_path: stored.storage_path });
    } else {
      out.push({ ...arq });
    }
  }
  return out;
}