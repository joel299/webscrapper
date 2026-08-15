import { withBrowser } from "../strategies/browser.js";
import { upsertEditaisFromList, type EditalRichItem } from "../../db/repositories/editais.js";

function extractDate(text: string): string | null {
  const m = text.match(/(?:inscriç[õo]es|até|fechamento|prazo|encerramento|data|término)[:\s]*([0-9]{1,2})[\/\.-]([0-9]{1,2})[\/\.-]([0-9]{2,4})/i);
  if (!m) {
    const fallback = text.match(/([0-9]{1,2})[\/\.-]([0-9]{1,2})[\/\.-]([0-9]{2,4})/);
    if (!fallback) return null;
    const [, d, m2, y] = fallback;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m2.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function extractValor(text: string): string | null {
  const m = text.match(/R\$\s*([0-9\.,]+)\s*(milh[õo]es|mil|bilh[õo]es|bilhão)?/i);
  if (!m) return null;
  let val = `R$ ${m[1]}`;
  if (m[2]) val += ` ${m[2].toLowerCase()}`;
  return val;
}

function extractWhatsApp(text: string): string | null {
  const m = text.match(/[Ww]hats[Aa]pp[^\d]{0,20}\(?\d{2}\)?\s*\d[-.\s]?\d{4}[-.\s]?\d{4}/);
  if (m) return m[0].replace(/^\s*[,:-]+\s*/, "").trim();
  const tel = text.match(/\(\d{2}\)\s*\d[-.\s]?\d{4}[-.\s]?\d{4}/);
  return tel ? tel[0] : null;
}

function extractOfficialLink(links: Array<{ href: string; text: string }>, fullText: string): string | null {
  // Exclude links in sidebar widgets and navigation
  const external = links.filter(
    (l) =>
      l.href.startsWith("http") &&
      !l.href.includes("capta.org.br") &&
      !l.href.startsWith("mailto:") &&
      !l.href.includes("facebook.com") &&
      !l.href.includes("twitter.com") &&
      !l.href.includes("instagram.com") &&
      !l.href.includes("wordpress") &&
      !l.href.includes("wp-login") &&
      !l.href.includes("cookies") &&
      !l.href.includes("privacidade") &&
      !l.href.includes("impactarte.org") && // sidebar recurring link
      !l.href.includes("ispn.org.br") &&     // footer link
      !l.href.includes("legislacao") &&
      !l.text.includes("impactarte") &&
      !l.text.includes("Política") &&
      l.href !== "https://capta.org.br/"
  );
  if (external.length === 0) return null;
  // Prefer links that appear in the main body (not sidebar)
  for (let i = external.length - 1; i >= 0; i--) {
    const pos = fullText.lastIndexOf(external[i].text);
    if (pos > fullText.length * 0.4 && external[i].text.length > 10) return external[i].href;
  }
  return external[external.length - 1].href;
}

function extractPDFs(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+\.pdf[^\s]*/i);
  return m ? m[0] : null;
}

function nextPageExists() {
  return !!(
    document.querySelector("a.next, .next, a[rel='next'], .next.page-numbers") ||
    Array.from(document.querySelectorAll("a.page-numbers")).some(
      (a) => a.textContent.trim() === String(Number(document.querySelector(".current, .page-numbers.current")?.textContent) + 1)
    )
  );
}

export async function captaScraper() {
  await withBrowser(async (page) => {
    const allItems: EditalRichItem[] = [];
    const seenUrls = new Set<string>();
    const baseLists = [
      "https://capta.org.br/oportunidades/",
      "https://capta.org.br/fontes-de-financiamento/oportunidades/"
    ];

    for (const baseList of baseLists) {
      let pageNum = 1;
      const maxPages = 10;
      while (pageNum <= maxPages) {
        const listUrl = pageNum === 1 ? baseList : `${baseList.replace(/\/$/, "")}/page/${pageNum}/`;
        // eslint-disable-next-line no-console
        console.log(`[capta] list ${baseList.substring(0, 50)} page ${pageNum}`);

        try {
          await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForTimeout(3000);
        } catch {
          break;
        }

        const candidates = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll("a[href*='oportunidades/']"));
          const result: Array<{ titulo: string; href: string }> = [];
          const seen = new Set<string>();
          anchors.forEach((a) => {
            const href = (a as HTMLAnchorElement).href;
            if (!href || seen.has(href)) return;
            if (href.includes("/page/") || href.includes("/fontes-de-financiamento/") || href.includes("/ver/")) return;
            const card = a.closest("article, .post, .entry, .card, li") || a.parentElement;
            let titulo = a.textContent.trim();
            const h = card ? card.querySelector("h1, h2, h3, h4, h5, .title, .entry-title") : null;
            if (h && h.textContent.trim() && h.textContent.trim().length > titulo.length) titulo = h.textContent.trim();
            if (!titulo || titulo.length < 5 || /^acessar$/i.test(titulo)) return;
            seen.add(href);
            result.push({ titulo, href });
          });
          return result;
        });

        if (candidates.length === 0) break;

        for (const item of candidates) {
          if (seenUrls.has(item.href)) continue;
          seenUrls.add(item.href);

          const baseItem: EditalRichItem = {
            titulo: item.titulo, link: item.href, status: "Aberto", data_fechamento: null, descricao: null
          };

          if (item.href.includes("capta.org.br/oportunidades/")) {
            try {
              await page.goto(item.href, { waitUntil: "domcontentloaded", timeout: 20000 });
              await page.waitForTimeout(2500);

              const detail = await page.evaluate(() => {
                const body = document.body.innerText;
                const title = document.title.replace(/ » Capta$/, "").trim();
                const allLinks = Array.from(document.querySelectorAll("a"))
                  .filter((a: HTMLAnchorElement) => a.href && !a.href.startsWith("javascript") && !a.href.includes("/wp-content/"))
                  .map((a: HTMLAnchorElement) => ({ href: a.href, text: a.textContent.replace(/\s+/g, " ").trim() }));
                const mainEl = document.querySelector("main, article, .post, [role='main'], #primary, .content-area") || document.body;
                const mainText = mainEl.textContent?.replace(/\s+/g, " ").trim() ?? body.replace(/\s+/g, " ").trim();
                return { title, body: body.replace(/\s+/g, " ").trim(), mainText, allLinks };
              });

              const officialLink = extractOfficialLink(detail.allLinks, detail.body);
              const pdfLink = extractPDFs(detail.body);
              const data_fechamento = extractDate(detail.body);
              const valorTexto = extractValor(detail.body);
              const whatsapp = extractWhatsApp(detail.body);
              const title = detail.title !== "Capta" ? detail.title : item.titulo;

              allItems.push({
                titulo: title, link: item.href, status: "Aberto", data_fechamento,
                descricao: detail.mainText.substring(0, 3000) || null,
                valorTexto, periodoTexto: data_fechamento ? `Inscrições até ${data_fechamento}` : null,
                whatsapp, siteOficial: officialLink, link_pdf: pdfLink
              });
              // eslint-disable-next-line no-console
              console.log(`[capta] ✓ ${title.substring(0, 40)}... fecha=${data_fechamento} valor=${valorTexto}`);
            } catch {
              allItems.push(baseItem);
            }
          } else {
            allItems.push(baseItem);
          }
        }

        const hasNext = await page.evaluate(() => !!(
          document.querySelector("a.next, .next, a[rel='next'], .next.page-numbers") ||
          Array.from(document.querySelectorAll("a.page-numbers"))
            .some(a => a.textContent.trim() === String(Number(document.querySelector(".current, .page-numbers.current")?.textContent) + 1))
        ));
        if (!hasNext) break;
        pageNum++;
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[capta] total items: ${allItems.length}`);
    if (allItems.length > 0) {
      const result = await upsertEditaisFromList("capta", allItems);
      // eslint-disable-next-line no-console
      console.log(`[capta] upsert: ${result.inserted}`);
    }
  });
}