import { upsertEditaisFromList, type EditalRichItem } from "../../db/repositories/editais.js";
import { TECHNOLOGY_QUERIES } from "../../config/searchQueries.js";
import { fetchWithRetry } from "../http.js";

const BASE = "https://api.queridodiario.ok.org.br/api/gazettes";

interface Gazete {
  date?: string;
  territory_id?: string;
  territory_name?: string;
  excerpt?: string;
  url?: string;
  txt_url?: string;
}

// um conjunto de trechos de busca para cada categoria de tecnologia
const TECH_QUERY_SNIPPETS: Record<string, string[]> = {
  software: ["licita fábrica de software", "contratação de desenvolvimento de sistemas"],
  ia: ["licita inteligência artificial", "pregão chatbot"],
  nuvem: ["licita computação em nuvem", "serviços em nuvem pregao"],
  dados: ["licita business intelligence", "contratação data warehouse"],
  ciberseguranca: ["licita segurança da informação", "pregão pentest"],
  ust: ["licita pontos de função", "contratação UST"],
  consultoria: ["licita service desk", "consultoria de TI pregao"],
  hardware: ["licita servidores", "aquisição de equipamentos de rede"]
};

function descriptionFromExcerpt(excerpt: string | undefined): string | null {
  if (!excerpt) return null;
  const text = excerpt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 3 ? text : null;
}

export async function queridoDiarioScraper() {
  const allItems: EditalRichItem[] = [];
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const until = new Date().toISOString().split("T")[0];

  for (const category of TECHNOLOGY_QUERIES) {
    const queries = TECH_QUERY_SNIPPETS[category.id] || category.terms.slice(0, 2);
    for (const q of queries) {
      const url = `${BASE}?since=${since}&until=${until}&size=15&q=${encodeURIComponent(q)}`;
      try {
        const res = await fetchWithRetry(url, {}, { timeoutMs: 20000 });
        if (!res.ok) continue;
        const data = (await res.json()) as { gazettes?: Gazete[] };
        for (const g of data.gazettes ?? []) {
          const link = g.txt_url || g.url;
          const titulo = `Aviso de licitação de tecnologia - ${g.territory_name || g.territory_id || "diário municipal"}`;
          const descricao = descriptionFromExcerpt(g.excerpt);
          if (!link) continue;
          allItems.push({
            titulo,
            link,
            status: "Aberto",
            data_fechamento: g.date,
            descricao,
            areaTematica: category.label,
            siteOficial: link
          });
        }
      } catch {
        // skip per-request errors
      }
    }
  }

  const deduped: EditalRichItem[] = [];
  const seen = new Set<string>();
  for (const item of allItems) {
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    deduped.push(item);
  }

  if (deduped.length) {
    const res = await upsertEditaisFromList("queridodiario", deduped);
    console.log(`[queridodiario] itens=${deduped.length} inseridos=${res.inserted}`);
    return { pagesScanned: TECHNOLOGY_QUERIES.length, itemsSeen: allItems.length, itemsInserted: res.inserted };
  }
  return { pagesScanned: TECHNOLOGY_QUERIES.length, itemsSeen: allItems.length, itemsInserted: 0 };
}