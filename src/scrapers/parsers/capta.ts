import * as cheerio from "cheerio";

export function parseCaptaList(html: string, baseUrl = "https://capta.org.br") {
  const $ = cheerio.load(html);
  const items: Array<{ titulo: string; link: string; status?: string; data_fechamento?: string | null; descricao?: string | null }> = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.includes("oportunidades/") && href !== `${baseUrl}/fontes-de-financiamento/oportunidades/`) {
      const titulo = $(el).text().trim();
      if (titulo && !titulo.includes("Oportunidades e editais") && !/^acessar$/i.test(titulo)) {
        const fullUrl = new URL(href, baseUrl).toString();
        const parentText = $(el).closest("article, div, li").text().replace(/\s+/g, " ").trim();
        const dateMatch = parentText.match(/(?:inscriç[õo]es|até|fechamento|prazo|encerramento)[:\s]*([0-9]{1,2}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/i);
        const data_fechamento = dateMatch ? dateMatch[1] : null;

        items.push({
          titulo,
          link: fullUrl,
          status: "Aberto",
          data_fechamento,
          descricao: parentText.substring(0, 300)
        });
      }
    }
  });

  return items;
}
