import { upsertEditaisFromList, type EditalRichItem } from "../../db/repositories/editais.js";

const BASE = "https://dadosabertos.compras.gov.br";

// Consulta a API de dados abertos do Compras.gov.br (módulo de licitações),
// filtrando por palavras-chave de tecnologia.
export async function comprasGovScraper() {
  const allItems: EditalRichItem[] = [];
  const regTech = /sistem|software|informát|nuvem|cloud|tecnologia|rede|servidor|desenvolvimento/i;

  const urls = [
    `${BASE}/modulo-licitacoes/6_consultas/consulta_licitacoes?pagina=1&tamanhoPagina=50`,
    `${BASE}/modulo-licitacoes/5_consultas/consulta_licitacao?pagina=1&tamanhoPagina=50`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { _embedded?: Record<string, Array<Record<string, unknown>>>; content?: Array<Record<string, unknown>> };
      const list = (data._embedded ? Object.values(data._embedded)[0] : null) ?? data.content ?? [];
      for (const raw of list.slice(0, 40)) {
        const item = raw as Record<string, unknown>;
        const objeto = String(item.objeto ?? item.descricao_objeto_objeto_solicitacao ?? item.descricao_objeto ?? "").trim();
        if (!regTech.test(objeto)) continue;
        const numero = String(item.numero_licitacao ?? item.numero ?? "");
        const titulo = objeto.length > 8 ? objeto : `Licitação nº ${numero} - Compras.gov`;
        const link = String(item.link_sistema_origem ?? item.link ?? "").trim() ||
          `https://www.gov.br/compras/pt-br/licitacoes-e-contratos/${numero}`;
        allItems.push({
          titulo,
          link,
          status: "Aberto",
          data_fechamento: String(item.data_hora_abertura ?? item.data_abertura ?? ""),
          descricao: objeto.substring(0, 400),
          publicoAlvo: "Pessoas jurídicas",
          siteOficial: "https://www.gov.br/compras/pt-br"
        });
      }
    } catch {
      continue;
    }
  }

  const seen = new Set<string>();
  const deduped = allItems.filter((i) => (seen.has(i.link) ? false : (seen.add(i.link), true)));

  if (deduped.length) {
    const res = await upsertEditaisFromList("comprasgov", deduped);
    console.log(`[comprasgov] itens=${deduped.length} inseridos=${res.inserted}`);
  }
}