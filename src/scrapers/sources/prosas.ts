import { withBrowser } from "../strategies/browser.js";
import { parseProsasList } from "../parsers/prosas.js";
import { upsertEditaisFromList } from "../../db/repositories/editais.js";

export async function prosasScraper() {
  await withBrowser(async (page) => {
    const baseUrl = "https://prosas.com.br";
    await page.goto("https://prosas.com.br/editais", { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector('a[href*="/editais/"]', { timeout: 10000 });
    } catch {
      // Page may still render; fallback to HTML parse below.
    }

    const domItems = await page.$$eval('a[href*="/editais/"]', (links) => {
      return links
        .map((el) => {
          const href = el.getAttribute("href") ?? "";
          const titulo = (el.textContent ?? "").trim();
          return { href, titulo };
        })
        .filter((item) => item.href && item.titulo && !/^acessar$/i.test(item.titulo) && !/^saiba mais$/i.test(item.titulo));
    });

    const html = await page.content();
    const parsedItems = parseProsasList(html);

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
    const result = await upsertEditaisFromList("prosas", items);
    // eslint-disable-next-line no-console
    console.log(`[prosas] itens=${items.length} inseridos=${result.inserted}`);
  });
}
