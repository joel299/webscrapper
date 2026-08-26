ALTER TABLE editais ADD COLUMN IF NOT EXISTS ultima_coleta_em TIMESTAMPTZ;

UPDATE editais
SET ultima_coleta_em = COALESCE(ultima_coleta_em, criado_em, now())
WHERE ultima_coleta_em IS NULL;

ALTER TABLE editais ALTER COLUMN ultima_coleta_em SET DEFAULT now();
ALTER TABLE editais ALTER COLUMN ultima_coleta_em SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_editais_retention
  ON editais (data_fechamento, ultima_coleta_em);
