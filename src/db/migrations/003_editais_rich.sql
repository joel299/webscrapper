DO $$
BEGIN
  ALTER TABLE editais ADD COLUMN IF NOT EXISTS valor_texto TEXT;
  ALTER TABLE editais ADD COLUMN IF NOT EXISTS periodo_texto TEXT;
  ALTER TABLE editais ADD COLUMN IF NOT EXISTS ods_texto TEXT;
  ALTER TABLE editais ADD COLUMN IF NOT EXISTS whatsapp TEXT;
  ALTER TABLE editais ADD COLUMN IF NOT EXISTS site_oficial TEXT;

  ALTER TABLE editais_arquivos ADD COLUMN IF NOT EXISTS titulo TEXT;
  ALTER TABLE editais_arquivos ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT NOW();
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'editais_arquivos_edital_url_unique'
  ) THEN
    CREATE UNIQUE INDEX editais_arquivos_edital_url_unique ON editais_arquivos (edital_id, url);
  END IF;
END
$$;