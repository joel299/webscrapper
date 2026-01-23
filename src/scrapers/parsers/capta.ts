import * as cheerio from "cheerio";

export function parseCaptaList(html: string) {
  const $ = cheerio.load(html);
  const items: Array<{ titulo: string; link: string }> = [];
  const baseUrl = "https://capta.org.br";

  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.includes("oportunidade")) {
      const titulo = $(el).text().trim();
      if (titulo) items.push({ titulo, link: new URL(href, baseUrl).toString() });
    }
  });

  return items;
}
