import { pool } from "../pool.js";

export async function listEditais(filters: Record<string, unknown>) {
  const page = Number(filters.page ?? 1);
  const limit = Number(filters.limit ?? 20);
  const offset = (page - 1) * limit;
  const values: Array<string | number> = [];
  const conditions: string[] = [];

  const addFilter = (value: unknown, expression: string) => {
    if (typeof value !== "string" || !value.trim()) return;
    values.push(`%${value.trim()}%`);
    conditions.push(expression.replace("$VALUE", `$${values.length}`));
  };

  addFilter(filters.fonte, "fonte ILIKE $VALUE");
  addFilter(filters.status, "status ILIKE $VALUE");
  addFilter(filters.texto, "(titulo ILIKE $VALUE OR descricao ILIKE $VALUE)");

  if (typeof filters.data_fechamento_inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(filters.data_fechamento_inicio)) {
    values.push(filters.data_fechamento_inicio);
    conditions.push(`data_fechamento >= $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  values.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT id, titulo, fonte, status, data_fechamento, link_edital, link_pdf, descricao
     FROM editais ${where}
     ORDER BY data_fechamento DESC NULLS LAST LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values
  );

  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM editais ${where}`, values.slice(0, -2));
  return { total: count.rows[0]?.total ?? 0, items: rows };
}

export async function listEditalSources() {
  const { rows } = await pool.query(
    "SELECT DISTINCT fonte FROM editais WHERE fonte IS NOT NULL AND fonte <> '' ORDER BY fonte"
  );
  return rows.map((row) => row.fonte as string);
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
  items: Array<{
    titulo: string;
    link: string;
    status?: string | null;
    data_fechamento?: string | Date | null;
    descricao?: string | null;
    link_pdf?: string | null;
  }>
) {
  if (items.length === 0) return { inserted: 0 };

  const values: Array<string | null> = [];
  const placeholders: string[] = [];
  let validCount = 0;

  items.forEach((item) => {
    const rawTitle = (item.titulo || "").trim();
    if (!rawTitle || /^acessar$/i.test(rawTitle) || /^saiba mais$/i.test(rawTitle) || /^leia mais$/i.test(rawTitle)) {
      return;
    }
    if (!item.link) return;

    let fechaDate: string | null = null;
    if (item.data_fechamento) {
      if (typeof item.data_fechamento === "string") {
        const d = item.data_fechamento.trim();
        const brMatch = d.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
        if (brMatch) {
          const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
          fechaDate = `${year}-${brMatch[2].padStart(2, "0")}-${brMatch[1].padStart(2, "0")}`;
        } else if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
          fechaDate = d.substring(0, 10);
        }
      } else if (item.data_fechamento instanceof Date && !isNaN(item.data_fechamento.getTime())) {
        fechaDate = item.data_fechamento.toISOString().split("T")[0];
      }
    }

    const base = validCount * 6;
    values.push(
      fonte,
      rawTitle,
      item.link,
      item.status?.trim() || "Aberto",
      fechaDate,
      item.descricao?.trim() || null
    );
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
    validCount++;
  });

  if (validCount === 0) return { inserted: 0 };

  const query = `
    INSERT INTO editais (fonte, titulo, link_edital, status, data_fechamento, descricao)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (link_edital) DO UPDATE SET
      titulo = EXCLUDED.titulo,
      status = COALESCE(EXCLUDED.status, editais.status),
      data_fechamento = COALESCE(EXCLUDED.data_fechamento, editais.data_fechamento),
      descricao = COALESCE(EXCLUDED.descricao, editais.descricao)
  `;

  const result = await pool.query(query, values);
  return { inserted: result.rowCount ?? 0 };
}
