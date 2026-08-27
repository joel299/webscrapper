import { upsertEditaisFromList } from "../../db/repositories/editais.js";
import { fetchWithRetry } from "../http.js";

interface PncpItem {
  id?: string;
  title?: string;
  description?: string;
  item_url?: string;
  numero_controle_pncp?: string;
  orgao_nome?: string;
  situacao_nome?: string;
  data_publicacao_pncp?: string;
  data_fim_vigencia?: string;
  municipio_nome?: string;
  uf?: string;
}

export async function pncpScraper() {
  const url = "https://pncp.gov.br/api/search/?q=edital&tipos_documento=edital&pagina=1&tam_pagina=30";
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json"
      }
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[pncp] HTTP ${res.status}`);
      return { pagesScanned: 1, itemsSeen: 0, itemsInserted: 0 };
    }

    const data = (await res.json()) as { items?: PncpItem[] };
    const items = data.items ?? [];

    const mapped = items
      .map((item) => {
        const tituloRaw = item.title || item.description || "";
        const orgao = item.orgao_nome ? `[${item.orgao_nome}] ` : "";
        const location = item.municipio_nome && item.uf ? ` (${item.municipio_nome}/${item.uf})` : "";
        const titulo = `${orgao}${tituloRaw}${location}`.trim();

        const path = item.item_url || `/compras/${item.numero_controle_pncp}`;
        const link = item.item_url?.startsWith("http") ? item.item_url : `https://pncp.gov.br${path}`;

        const status = item.situacao_nome || "Divulgada no PNCP";
        const dateRaw = item.data_fim_vigencia || item.data_publicacao_pncp || null;
        const data_fechamento = dateRaw ? dateRaw.substring(0, 10) : null;
        const descricao = item.description || null;

        return { titulo, link, status, data_fechamento, descricao };
      })
      .filter((x) => x.titulo && x.link);

    const result = await upsertEditaisFromList("pncp", mapped);
    // eslint-disable-next-line no-console
    console.log(`[pncp] itens=${mapped.length} inseridos=${result.inserted}`);
    return { pagesScanned: 1, itemsSeen: items.length, itemsInserted: result.inserted };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[pncp] erro:", error);
    return { pagesScanned: 1, itemsSeen: 0, itemsInserted: 0 };
  }
}
