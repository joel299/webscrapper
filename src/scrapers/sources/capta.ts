import { withBrowser } from "../strategies/browser.js";
import { parseCaptaList } from "../parsers/capta.js";
import { upsertEditaisFromList } from "../../db/repositories/editais.js";

export async function captaScraper() {
  await withBrowser(async (page) => {
    const baseUrl = "https://capta.org.br";
    await page.goto("https://capta.org.br/fontes-de-financiamento/oportunidades/", { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector('a[href*="oportunidades/"]', { timeout: 10000 });
    } catch {
      // Continue to parse DOM below
    }

    const domItems = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href*='oportunidades/']"));
      const items: Array<{ titulo: string; link: string; status: string; data_fechamento: string | null; descricao: string | null }> = [];
      const seen = new Set<string>();

      anchors.forEach((a) => {
        const linkEl = a as HTMLAnchorElement;
        const href = linkEl.href;
        if (!href || href === "https://capta.org.br/fontes-de-financiamento/oportunidades/" || seen.has(href)) return;

        const card = linkEl.closest("article, .post, .entry, .card, div, li") || linkEl.parentElement;
        const fullText = card ? card.textContent?.replace(/\s+/g, " ").trim() ?? "" : linkEl.textContent?.trim() ?? "";

        let titulo = linkEl.textContent?.trim() ?? "";
        if (!titulo || titulo.includes("Oportunidades e editais")) {
          const h = card ? card.querySelector("h1, h2, h3, h4, h5, strong, .title") : null;
          if (h && h.textContent?.trim()) titulo = h.textContent.trim();
        }
        if (!titulo || titulo.includes("Oportunidades e editais") || /^acessar$/i.test(titulo)) return;

        seen.add(href);

        const dateMatch = fullText.match(/(?:inscriç[õo]es|até|fechamento|prazo|encerramento|data|término)[:\s]*([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/i) || fullText.match(/([0-9]{1,2}\s+de\s+[a-zç]+\s+de\s+[0-9]{4})/i);
        const data_fechamento = dateMatch ? dateMatch[1] : null;

        const statusMatch = fullText.match(/(inscriç[õo]es abertas|aberto|prorrogado|em andamento|últimos dias|inscrições até)/i);
        const status = statusMatch ? statusMatch[1].toLowerCase() : "Aberto";

        items.push({
          titulo,
          link: href,
          status: status.charAt(0).toUpperCase() + status.slice(1),
          data_fechamento,
          descricao: fullText.substring(0, 300)
        });
      });
      return items;
    });

    const html = await page.content();
    const parsedItems = parseCaptaList(html, baseUrl);

    const mergedMap = new Map<string, { titulo: string; link: string; status?: string; data_fechamento?: string | null; descricao?: string | null }>();
    [...parsedItems, ...domItems].forEach((item) => {
      if (item.link && item.titulo) mergedMap.set(item.link, item);
    });

    const items = Array.from(mergedMap.values());
    const result = await upsertEditaisFromList("capta", items);
    // eslint-disable-next-line no-console
    console.log(`[capta] itens=${items.length} inseridos=${result.inserted}`);
  });
}
