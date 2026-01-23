import { pool } from "../pool.js";

export async function listEditais(filters: Record<string, unknown>) {
  const page = Number(filters.page ?? 1);
  const limit = Number(filters.limit ?? 20);
  const offset = (page - 1) * limit;

  const { rows } = await pool.query(
    "SELECT id, titulo, fonte, status, data_fechamento, link_edital, link_pdf FROM editais ORDER BY data_fechamento DESC NULLS LAST LIMIT $1 OFFSET $2",
    [limit, offset]
  );

  const count = await pool.query("SELECT COUNT(*)::int AS total FROM editais");
  return { total: count.rows[0]?.total ?? 0, items: rows };
}

export async function getEditalById(id: string) {
  const edital = await pool.query(
    "SELECT * FROM editais WHERE id = $1",
    [id]
  );

  if (edital.rowCount === 0) return null;

  const contatos = await pool.query(
    "SELECT email, telefone, celular FROM editais_contatos WHERE edital_id = $1",
    [id]
  );

  const arquivos = await pool.query(
    "SELECT tipo, url FROM editais_arquivos WHERE edital_id = $1",
    [id]
  );

  return {
    ...edital.rows[0],
    contatos: {
      email: contatos.rows.map((row) => row.email).filter(Boolean),
      telefone: contatos.rows.map((row) => row.telefone).filter(Boolean),
      celular: contatos.rows.map((row) => row.celular).filter(Boolean)
    },
    arquivos: arquivos.rows
  };
}

export async function upsertEditaisFromList(
  fonte: string,
  items: Array<{ titulo: string; link: string }>
) {
  if (items.length === 0) return { inserted: 0 };

  const values: Array<string | null> = [];
  const placeholders: string[] = [];

  items.forEach((item, index) => {
    const base = index * 3;
    values.push(fonte, item.titulo, item.link);
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
  });

  const query = `
    INSERT INTO editais (fonte, titulo, link_edital)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (link_edital) DO NOTHING
  `;

  const result = await pool.query(query, values);
  return { inserted: result.rowCount ?? 0 };
}
