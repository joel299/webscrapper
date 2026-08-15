CREATE TABLE IF NOT EXISTS edital_analises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'aderencia',
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  modelo TEXT,
  prompt_version TEXT NOT NULL DEFAULT '1.0.0',
  cache_key TEXT NOT NULL,
  resultado JSONB,
  erro TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  UNIQUE (edital_id, tipo, cache_key)
);
CREATE INDEX IF NOT EXISTS idx_edital_analises_edital ON edital_analises(edital_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_edital_analises_expira ON edital_analises(expira_em);