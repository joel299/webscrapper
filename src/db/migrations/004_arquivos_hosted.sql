-- Rastreia arquivos hospedados no bucket Supabase (proxy de PDFs expirados).
CREATE TABLE IF NOT EXISTS editais_arquivos_hosted (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edital_id UUID REFERENCES editais(id) ON DELETE CASCADE,
  url_original TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  url_publica TEXT NOT NULL,
  titulo TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_arquivos_hosted_expira ON editais_arquivos_hosted (expira_em);