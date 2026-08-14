import * as cheerio from "cheerio";

export function parseProsasList(html: string) {
  const $ = cheerio.load(html);
  const items: Array<{ titulo: string; link: string }> = [];
  const baseUrl = "https://prosas.com.br";

  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.includes("/editais/")) {
      const titulo = $(el).text().trim();
      if (titulo && !/^acessar$/i.test(titulo) && !/^saiba mais$/i.test(titulo)) {
        items.push({ titulo, link: new URL(href, baseUrl).toString() });
      }
    }
  });

  return items;
}
