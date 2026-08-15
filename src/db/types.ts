// Re-export of a row type used by the formatter.
// Keeps the formatter decoupled from the DB pool internals.
export interface EditalRow {
  id?: string;
  fonte?: string | null;
  titulo?: string | null;
  status?: string | null;
  descricao?: string | null;
  elegibilidade?: string | null;
  area_tematica?: string | null;
  publico_alvo?: string | null;
  data_abertura?: string | Date | null;
  data_fechamento?: string | Date | null;
  valor_texto?: string | null;
  periodo_texto?: string | null;
  ods_texto?: string | null;
  whatsapp?: string | null;
  site_oficial?: string | null;
  link_edital?: string | null;
  link_pdf?: string | null;
  contatos?: { email?: string[]; telefone?: string[]; celular?: string[] };
  arquivos?: Array<{ tipo?: string | null; url?: string | null; titulo?: string | null }>;
}
