import { chromium } from "playwright";
import { env } from "../../config/env.js";
import { upsertEditaisFromList } from "../../db/repositories/editais.js";

let cachedStorageStatePath = "/tmp/prosas_storage.json";

function stripHtml(html: string) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function prosasScraper() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/google-chrome";
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"], headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const user = env.PROSAS_USER || process.env.PROSAS_USER || "joel.acosta.quintana@gmail.com";
  const pass = env.PROSAS_PASS || process.env.PROSAS_PASS || "Dj@7408-2012";

  let bearerToken = "";
  page.on("request", (req) => {
    if (req.url().includes("selecao/api") && req.headers()["authorization"]) {
      bearerToken = req.headers()["authorization"];
    }
  });

  try {
    // 1. Perform Login
    await page.goto("https://prosas.com.br/users/sign_in", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const emailInput = page.locator('#user_email').filter({ hasNot: page.locator('[style*="display: none"]') }).last();
    const passInput = page.locator('#user_password').filter({ hasNot: page.locator('[style*="display: none"]') }).last();

    if (await emailInput.count() > 0) {
      await emailInput.fill(user);
      await passInput.fill(pass);
      const submitBtn = page.locator('input[type="submit"][name="commit"]').last();
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
        submitBtn.click()
      ]);
      await page.waitForTimeout(3000);
    }

    // 2. Open Editais Catalog to capture token
    await page.goto("https://produtos.prosas.com.br/editais", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    if (!bearerToken) {
      // eslint-disable-next-line no-console
      console.warn("[prosas] Bearer token not captured, attempting fallback");
    }

    // 3. Query Open Editais API
    const listUrl = "https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?include=area_interesses,incentivador&page[page]=1&page[size]=50";
    const apiRes = await context.request.get(listUrl, {
      headers: {
        Authorization: bearerToken || "",
        Referer: "https://produtos.prosas.com.br/"
      }
    });

    if (!apiRes.ok()) {
      // eslint-disable-next-line no-console
      console.error(`[prosas] API list HTTP ${apiRes.status()}`);
      return;
    }

    const apiData = (await apiRes.json()) as { data?: Array<{ id: string; attributes: Record<string, any> }> };
    const rawItems = apiData.data ?? [];

    const mappedItems: Array<{
      titulo: string;
      link: string;
      status: string;
      data_fechamento: string | null;
      descricao: string | null;
      link_pdf: string | null;
    }> = [];

    for (const item of rawItems) {
      const attrs = item.attributes ?? {};
      const id = String(attrs.id || item.id);
      const titulo = (attrs.nome || "").trim();
      if (!titulo) continue;

      const link = `https://produtos.prosas.com.br/editais/edital?edital_id=${id}`;
      const data_fechamento = attrs.encerramento_das_inscricoes || attrs.data_final_inscricoes || null;
      const status = attrs.prazo === "definido" ? "Aberto" : "Aberto";

      // Build rich description snippet from list attributes
      const empresa = attrs.nome_empresa ? `Patrocinador: ${attrs.nome_empresa}. ` : "";
      const valor = attrs.valor_total_disponivel ? `Valor Total: R$ ${attrs.valor_total_disponivel}. ` : "";
      const descText = stripHtml(attrs.descricao || "");
      const descricao = `${empresa}${valor}${descText}`.trim() || null;
      const link_pdf = attrs.link && /\.pdf($|\?)/i.test(attrs.link) ? attrs.link : null;

      mappedItems.push({
        titulo,
        link,
        status,
        data_fechamento,
        descricao,
        link_pdf
      });
    }

    const result = await upsertEditaisFromList("prosas", mappedItems);
    // eslint-disable-next-line no-console
    console.log(`[prosas] itens=${mappedItems.length} inseridos=${result.inserted}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[prosas] erro:", error);
  } finally {
    await page.close();
    await browser.close();
  }
}
