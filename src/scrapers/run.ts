import { prosasScraper } from "./sources/prosas.js";
import { ligaCriativaScraper } from "./sources/ligacriativa.js";
import { captaScraper } from "./sources/capta.js";
import { pncpScraper } from "./sources/pncp.js";

const scrapers = {
  capta: captaScraper,
  pncp: pncpScraper,
  prosas: prosasScraper,
  ligacriativa: ligaCriativaScraper
};

export const availableSources = Object.keys(scrapers);

const fonteAliases: Record<string, keyof typeof scrapers> = {
  "https://prosas.com.br/editais": "prosas",
  "https://www.ligacriativa.com.br/editais-abertos": "ligacriativa",
  "https://capta.org.br/fontes-de-financiamento/oportunidades/": "capta"
};

function normalizeFonte(input: string) {
  if (input in scrapers) return input as keyof typeof scrapers;
  if (input in fonteAliases) return fonteAliases[input];
  return null;
}

export async function runScrapers(fonte: string) {
  if (fonte === "all") {
    for (const scraper of Object.values(scrapers)) {
      await scraper();
    }
    return;
  }

  const normalized = normalizeFonte(fonte);
  const scraper = normalized ? scrapers[normalized] : undefined;
  if (!scraper) {
    throw new Error(`Fonte nao suportada: ${fonte}`);
  }

  await scraper();
}
