ALTER TABLE editais
  ADD CONSTRAINT editais_link_edital_unique UNIQUE (link_edital);
