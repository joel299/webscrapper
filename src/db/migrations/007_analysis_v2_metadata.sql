ALTER TABLE edital_analises ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE edital_analises ADD COLUMN IF NOT EXISTS data_analise TIMESTAMPTZ;

UPDATE edital_analises
SET data_analise = COALESCE(data_analise, criado_em)
WHERE data_analise IS NULL;

ALTER TABLE edital_analises ALTER COLUMN data_analise SET DEFAULT now();
ALTER TABLE edital_analises ALTER COLUMN data_analise SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_edital_analises_content_hash
  ON edital_analises(edital_id, prompt_version, content_hash);
