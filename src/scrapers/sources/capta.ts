import { withBrowser } from "../strategies/browser.js";
import { parseCaptaList } from "../parsers/capta.js";
import { upsertEditaisFromList } from "../../db/repositories/editais.js";

export async function captaScraper() {
  await withBrowser(async (page) => {
    const baseUrl = "https://capta.org.br";
    await page.goto("https://capta.org.br/fontes-de-financiamento/oportunidades/", { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector('a[href*="oportunidade"]', { timeout: 10000 });
    } catch {
      // Page may still render; fallback to HTML parse below.
    }

    const domItems = await page.$$eval('a[href*="oportunidade"]', (links) => {
      return links
        .map((el) => {
          const href = el.getAttribute("href") ?? "";
          const titulo = (el.textContent ?? "").trim();
          return { href, titulo };
        })
        .filter((item) => item.href && item.titulo);
    });

    const html = await page.content();
    const parsedItems = parseCaptaList(html);

    const merged = [
      ...domItems.map((item) => ({ titulo: item.titulo, link: new URL(item.href, baseUrl).toString() })),
      ...parsedItems
    ];
    const unique = new Map<string, { titulo: string; link: string }>();
    merged.forEach((item) => {
      if (!item.link) return;
      unique.set(item.link, item);
    });

    const items = Array.from(unique.values());
    const result = await upsertEditaisFromList("capta", items);
    // eslint-disable-next-line no-console
    console.log(`[capta] itens=${items.length} inseridos=${result.inserted}`);
  });
}
