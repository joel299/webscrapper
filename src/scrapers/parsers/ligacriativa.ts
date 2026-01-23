import * as cheerio from "cheerio";

export function parseLigaCriativaList(html: string) {
  const $ = cheerio.load(html);
  const items: Array<{ titulo: string; link: string }> = [];
  const baseUrl = "https://www.ligacriativa.com.br";

  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.includes("/editais")) {
      const titulo = $(el).text().trim();
      if (titulo) items.push({ titulo, link: new URL(href, baseUrl).toString() });
    }
  });

  return items;
}
