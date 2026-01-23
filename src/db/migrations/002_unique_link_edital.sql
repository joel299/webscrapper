DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname = 'editais_link_edital_unique'
    ) THEN
        CREATE UNIQUE INDEX editais_link_edital_unique ON editais(link_edital);
    END IF;
END
$$;
