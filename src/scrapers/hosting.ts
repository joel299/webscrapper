import type { BrowserContext } from "playwright";
import { uploadBuffer } from "../storage/supabase.js";
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

// Baixa binário usando a sessão autenticada do Playwright (carrega cookies + bearer da Prosas)
// e re-hospeda no bucket Supabase (expira 7 dias). Retorna lista com url pública quando possível.
export async function hospedarArquivos(
  context: BrowserContext,
  arquivos: ArquivoParaHospedar[],
  extraHeaders: Record<string, string> = {}
): Promise<ArquivoHospedado[]> {
  const out: ArquivoHospedado[] = [];
  for (const arq of arquivos) {
    if (!arq.url) {
      out.push({ ...arq });
      continue;
    }
    if (arq.url.includes("/storage/v1/object/public/")) {
      out.push({ ...arq, url_publica: arq.url });
      continue;
    }
    const ext = arq.url.match(/\.([A-Za-z0-9]{2,5})(\?|$)/)?.[1] || "pdf";
    const name = `${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
    const stored = await thisRemoteWithContext(context, arq.url, name, extraHeaders);
    if (stored) {
      await recordExpiry(stored.storage_path, stored.url_publica, arq.url, arq.titulo);
      out.push({ ...arq, url: stored.url_publica, url_publica: stored.url_publica, storage_path: stored.storage_path });
    } else {
      out.push({ ...arq });
    }
  }
  return out;
}

// Baixa via context do Playwright (usa cookies/sessão) e faz upload no bucket.
async function thisRemoteWithContext(
  context: BrowserContext,
  remoteUrl: string,
  objectName: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ url_publica: string; storage_path: string } | null> {
  try {
    const res = await context.request.get(remoteUrl, { headers: extraHeaders, timeout: 40000 });
    if (!res.ok()) return null;
    const buf = new Uint8Array(await res.body());
    if (!buf.length) return null;
    const ext = objectName.match(/\.(\w+)$/)?.[1] || "pdf";
    const ctype = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";
    return await uploadBuffer(buf, objectName, ctype);
  } catch {
    return null;
  }
}

async function recordExpiry(storagePath: string, urlPublica: string, urlOriginal: string, titulo: string | null | undefined): Promise<void> {
  await pool.query(
    `INSERT INTO editais_arquivos_hosted (edital_id, url_original, storage_path, url_publica, titulo, expira_em)
     VALUES (NULL, $1, $2, $3, $4, now() + interval '7 days')
     ON CONFLICT (storage_path) DO UPDATE SET expira_em = now() + interval '7 days'`,
    [urlOriginal, storagePath, urlPublica, titulo || null]
  );
}