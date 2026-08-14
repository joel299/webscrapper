import * as cheerio from "cheerio";
import { withBrowser } from "./strategies/browser.js";
import { extractContacts } from "../utils/contacts.js";
import { assertSafeExternalUrl, capExtractedText } from "../utils/safety.js";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeText(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/function\s*\(|\bvar\s+|window\.|document\.|<script>|<\/script>/i.test(line))
    .filter((line) => !/(cookies|cookie|login|entrar|acessar|cadastre-se|cadastro|politica de privacidade|termos de uso|menu)/i.test(line));

  return lines.join("\n");
}

function extractSectionText($: cheerio.CheerioAPI, labels: string[]) {
  const labelRegex = new RegExp(`^(${labels.join("|")})$`, "i");
  const heading = $("h1,h2,h3,h4,strong,label,span").filter((_, el) => {
    const text = normalizeText($(el).text());
    return labelRegex.test(text);
  }).first();

  if (heading.length === 0) return null;

  const container = heading.parent();
  const next = container.next();
  const text = normalizeText(next.text() || container.text());
  return text || null;
}

function extractLinks($: cheerio.CheerioAPI, baseUrl: string) {
  const links = $("a")
    .map((_, el) => ({
      href: $(el).attr("href") ?? "",
      text: normalizeText($(el).text())
    }))
    .get()
    .filter((item) => item.href);

  return links.map((item) => ({
    url: new URL(item.href, baseUrl).toString(),
    titulo: item.text || null
  }));
}

function pickFileLinks(links: Array<{ url: string; titulo: string | null }>) {
  return links.filter((link) => /\.pdf($|\?)/i.test(link.url) || /download|anexo|arquivo/i.test(link.titulo ?? ""));
}

export async function fetchEditalDetail(url: string) {
  const safeUrl = await assertSafeExternalUrl(url);
  return withBrowser(async (page) => {
    await page.goto(safeUrl.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(2000);

    const html = await page.content();
    const $ = cheerio.load(html);

    $("script,style,noscript,iframe,svg,canvas").remove();
    $("header,footer,nav,aside,form,button").remove();
    $("[class],[id]").each((_, el) => {
      const cls = $(el).attr("class") ?? "";
      const id = $(el).attr("id") ?? "";
      if (/(cookie|navbar|header|footer|menu|modal|banner|popup)/i.test(`${cls} ${id}`)) {
        $(el).remove();
      }
    });

    const titulo = normalizeText($("h1").first().text());
    const descricao = extractSectionText($, ["About", "Sobre", "Descricao", "Descrição"]) ?? null;
    const areaTematica = extractSectionText($, ["Area of practice", "Area de pratica", "Área de prática"]) ?? null;
    const subareasRaw = extractSectionText($, ["Subarea", "Subárea", "Subareas", "Subáreas"]);
    const subareas = subareasRaw ? subareasRaw.split(/\s*[;,\n]\s*/).map((item) => item.trim()).filter(Boolean) : [];

    const baseUrl = safeUrl.origin;
    const links = extractLinks($, baseUrl);
    const arquivos = pickFileLinks(links).map((item) => ({
      tipo: item.url.toLowerCase().includes(".pdf") ? "pdf" : "anexo",
      url: item.url,
      titulo: item.titulo
    }));

    const mainText = $("main, [role='main']").first().text();
    const rawText = mainText || $("body").text();
    const textoCompleto = capExtractedText(sanitizeText(rawText));
    const contatos = extractContacts(textoCompleto);

    return {
      url: safeUrl.toString(),
      titulo: titulo || null,
      descricao: descricao || null,
      area_tematica: areaTematica || null,
      texto_completo: textoCompleto || null,
      subareas,
      contatos,
      arquivos
    };
  });
}
