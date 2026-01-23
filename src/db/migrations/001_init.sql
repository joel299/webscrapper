CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS editais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fonte TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT,
  publico_alvo TEXT,
  elegibilidade TEXT,
  area_tematica TEXT,
  data_abertura DATE,
  data_fechamento DATE,
  valor_estimado NUMERIC,
  link_edital TEXT,
  link_pdf TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS editais_contatos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edital_id UUID REFERENCES editais(id) ON DELETE CASCADE,
  email TEXT,
  telefone TEXT,
  celular TEXT
);

CREATE TABLE IF NOT EXISTS editais_arquivos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edital_id UUID REFERENCES editais(id) ON DELETE CASCADE,
  tipo TEXT,
  url TEXT,
  texto_extraido TEXT
);
