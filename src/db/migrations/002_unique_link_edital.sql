DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname IN ('editais_link_edital_unique', 'editais_link')
    ) THEN
        DROP INDEX IF EXISTS editais_link_edital_unique;
        DROP INDEX IF EXISTS editais_link;
    END IF;
    CREATE UNIQUE INDEX editais_link_edital_unique ON editais(link_edital);
END
$$;
