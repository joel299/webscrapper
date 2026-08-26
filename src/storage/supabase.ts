import { env } from "../config/env.js";

export interface StoredFile {
  url_publica: string;
  storage_path: string;
}

const base = () => env.SUPABASE_URL.replace(/\/$/, "");
const bucket = () => env.SUPABASE_BUCKET || "edital";

function headers() {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
  };
}

// Faz upload de um buffer binário no bucket público e retorna a URL pública.
export async function uploadBuffer(
  buffer: Uint8Array,
  objectName: string,
  contentType = "application/pdf"
): Promise<StoredFile | null> {
  const key = `editais/${objectName}`;
  const res = await fetch(`${base()}/storage/v1/object/${bucket()}/${key}`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": contentType },
    body: buffer as unknown as BodyInit
  });
  if (!res.ok) {
    console.warn(`[storage] upload falhou ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return { url_publica: `${base()}/storage/v1/object/public/${bucket()}/${key}`, storage_path: key };
}

// Baixa um arquivo remoto e o re-hospeda no bucket. Retorna URL pública + path.
export async function hostRemoteFile(
  remoteUrl: string,
  objectName: string,
  extraHeaders: Record<string, string> = {},
  contentType = "application/pdf"
): Promise<StoredFile | null> {
  try {
    const res = await fetch(remoteUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; webscrapper)", ...extraHeaders },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) return null;
    return await uploadBuffer(bytes, objectName, contentType);
  } catch {
    return null;
  }
}

export async function deleteObject(objectName: string): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/storage/v1/object/${bucket()}/${objectName}`, {
      method: "DELETE",
      headers: headers()
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Lista objetos do bucket com prefixo.
export async function listBucket(prefix = "editais/"): Promise<Array<{ name: string; created_at?: string }>> {
  try {
    const res = await fetch(`${base()}/storage/v1/object/list/${bucket()}`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 })
    });
    if (!res.ok) return [];
    return (await res.json()) as Array<{ name: string; created_at?: string }>;
  } catch {
    return [];
  }
}

// Upsert de uma análise na tabela REST do Supabase (PostgREST).
// Requer a tabela public.edital_analises criada via SQL no projeto Supabase.
export async function upsertAnalysisToSupabase(payload: {
  analysis_id: string;
  edital_id: string;
  edital_titulo: string;
  fonte: string;
  status: string;
  modelo: string;
  resultado: unknown;
  expira_em: string;
}): Promise<boolean> {
  if (!env.SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(`${base()}/rest/v1/edital_analises`, {
      method: "POST",
      headers: {
        ...headers(),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.warn(`[supabase] upsert análise falhou ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e: any) {
    console.warn(`[supabase] upsert análise erro: ${e?.message || e}`);
    return false;
  }
}