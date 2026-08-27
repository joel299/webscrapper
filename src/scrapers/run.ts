import { prosasScraper } from "./sources/prosas.js";
import { ligaCriativaScraper } from "./sources/ligacriativa.js";
import { captaScraper } from "./sources/capta.js";
import { pncpScraper } from "./sources/pncp.js";
import { queridoDiarioScraper } from "./sources/queridodiario.js";
import { comprasGovScraper } from "./sources/comprasgov.js";
import { comprasBrScraper } from "./sources/comprasbr.js";
import { finishScraperRun, startScraperRun, type ScraperRunMetrics } from "./runStatus.js";

const scrapers = {
  capta: captaScraper,
  pncp: pncpScraper,
  prosas: prosasScraper,
  ligacriativa: ligaCriativaScraper,
  queridodiario: queridoDiarioScraper,
  comprasgov: comprasGovScraper,
  compras_br: comprasBrScraper
};

export const availableSources = Object.keys(scrapers);

const fonteAliases: Record<string, keyof typeof scrapers> = {
  "https://prosas.com.br/editais": "prosas",
  "https://www.ligacriativa.com.br/editais-abertos": "ligacriativa",
  "https://capta.org.br/fontes-de-financiamento/oportunidades/": "capta",
  "https://comprasbr.com.br/pregao-eletronico/?objeto=IA&status=ABERTO": "compras_br"
};

function normalizeFonte(input: string) {
  if (input in scrapers) return input as keyof typeof scrapers;
  if (input in fonteAliases) return fonteAliases[input];
  return null;
}

async function runOne(source: keyof typeof scrapers, jobId?: string) {
  let runId: number | null = null;
  try {
    runId = await startScraperRun(source, jobId ? `${jobId}:${Date.now()}` : undefined);
    const persisted = await scrapers[source]();
    const metrics: ScraperRunMetrics = typeof persisted === "number" ? { itemsInserted: persisted } : (persisted || {});
    await finishScraperRun(runId, "success", metrics);
  } catch (error) {
    if (runId !== null) await finishScraperRun(runId, "failed", {}, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function runScrapers(fonte: string, jobId?: string) {
  if (fonte === "all") {
    const sources = Object.keys(scrapers) as Array<keyof typeof scrapers>;
    for (let index = 0; index < sources.length; index += 2) {
      await Promise.all(sources.slice(index, index + 2).map(async (source) => {
        try { await runOne(source, jobId); } catch (error) { console.error(`[scraper] fonte=${source} falhou: ${String(error)}`); }
      }));
    }
    return;
  }
  const normalized = normalizeFonte(fonte);
  if (!normalized) throw new Error(`Fonte nao suportada: ${fonte}`);
  await runOne(normalized, jobId);
}
