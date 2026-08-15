import { chromium } from "playwright";
import { env } from "../../config/env.js";
import { upsertEditaisFromList, type EditalRichItem } from "../../db/repositories/editais.js";
import { hospedarArquivos, type ArquivoHospedado } from "../hosting.js";

function stripHtml(html: string) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function money(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (isNaN(n)) return null;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function whatsappFromDescription(text: string) {
  const m = text.match(/[Ww]hats[Aa]pp[^\d]{0,20}\(?\d{2}\)?\s*\d[-.\s]?\d{4}[-.\s]?\d{4}|\(\d{2}\)\s*\d[-.\s]?\d{4}[-.\s]?\d{4}/);
  return m ? m[0].replace(/^\s*[,-]+\s*/, "").trim() : null;
}

export async function prosasScraper() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const user = env.PROSAS_USER || process.env.PROSAS_USER || "joel.acosta.quintana@gmail.com";
  const pass = env.PROSAS_PASS || process.env.PROSAS_PASS || "";

  let bearerToken = "";
  page.on("request", (req) => {
    if (req.url().includes("selecao/api") && req.headers()["authorization"]) {
      bearerToken = req.headers()["authorization"];
    }
  });

  try {
    await page.goto("https://prosas.com.br/users/sign_in", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const emailInput = page.locator("#user_email").filter({ hasNot: page.locator('[style*="display: none"]') }).last();
    const passInput = page.locator("#user_password").filter({ hasNot: page.locator('[style*="display: none"]') }).last();

    if ((await emailInput.count()) > 0) {
      await emailInput.fill(user);
      await passInput.fill(pass);
      const submitBtn = page.locator('input[type="submit"][name="commit"]').last();
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
        submitBtn.click()
      ]);
      await page.waitForTimeout(3000);
    }

    await page.goto("https://produtos.prosas.com.br/editais", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    if (!bearerToken) {
      // eslint-disable-next-line no-console
      console.warn("[prosas] Bearer token not captured");
    }

    const listUrl =
      "https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?page[page]=1&page[size]=50";
    const apiRes = await context.request.get(listUrl, {
      headers: { Authorization: bearerToken, Referer: "https://produtos.prosas.com.br/" }
    });

    if (!apiRes.ok()) {
      // eslint-disable-next-line no-console
      console.error(`[prosas] API list HTTP ${apiRes.status()}`);
      return;
    }

    const apiData = (await apiRes.json()) as { data?: Array<{ id: string; attributes: Record<string, any> }> };
    const rawItems = apiData.data ?? [];

    const mappedItems: EditalRichItem[] = [];

    for (const item of rawItems) {
      const attrs = item.attributes ?? {};
      const id = String(attrs.id || item.id);
      const titulo = (attrs.nome || "").trim();
      if (!titulo) continue;

      const link = `https://produtos.prosas.com.br/editais/edital?edital_id=${id}`;

      let detailAttrs: Record<string, any> = {};
      let arquivos: Array<{ tipo: string; url: string; titulo: string }> = [];
      let byType: Record<string, any[]> = {};

      if (bearerToken) {
        const detailRes = await context.request.get(
          `https://prosas.com.br/selecao/api/v2/third_party/oportunidades/${id}?include=area_interesses,incentivador,anexos,sites,locais,ods,culturas,publico_alvos,arquivos,fonte_financiamentos`,
          { headers: { Authorization: bearerToken, Referer: "https://produtos.prosas.com.br/" } }
        );
        if (detailRes.ok()) {
          const detailJson = (await detailRes.json()) as {
            data?: { attributes?: Record<string, any> };
            included?: Array<{ type: string; attributes?: Record<string, any> }>;
          };
          detailAttrs = detailJson.data?.attributes ?? {};
          (detailJson.included ?? []).forEach((entry) => {
            (byType[entry.type] = byType[entry.type] || []).push(entry.attributes ?? {});
          });
          arquivos = (byType["arquivo"] || []).map((a) => ({
            tipo: "pdf",
            url: a.url || "",
            titulo: a.descricao || a.arquivo_file_name || ""
          }));
        }
      }

      const descricao = stripHtml(detailAttrs.descricao || attrs.descricao || "") || null;

      const data_fechamento =
        detailAttrs.encerramento_das_inscricoes || detailAttrs.data_final_inscricoes || attrs.encerramento_das_inscricoes || null;

      const inicio = String(detailAttrs.inicio_inscricoes || attrs.inicio_inscricoes || "").substring(0, 10) || null;
      const periodoTexto = inicio && data_fechamento ? `Inscrições de ${inicio} até ${data_fechamento}` : data_fechamento ? `Inscrições até ${data_fechamento}` : null;

      const valorTexto = money(detailAttrs.valor_total_disponivel || attrs.valor_total_disponivel);
      const areaTematica = (byType["area_interesse"] || []).map((a) => a.nome).filter(Boolean).join(", ") || null;
      const publicoAlvo = (byType["publico_alvo"] || []).map((a) => a.nome || a.descricao).filter(Boolean).join(", ") || null;
      const odsTexto = (byType["ods"] || []).map((o) => o.descricao || o.nome).filter(Boolean).join(", ") || null;
      const siteOficial = (byType["sites"] || []).map((s) => s.link).find(Boolean) || null;
      const whatsapp = whatsappFromDescription(descricao || "");

      // Baixa e re-hospeda OS PDFs JÁ AQUI, enquanto o link assinado Oracle ainda é válido.
      // (A hospedagem pós-loop falhava pois o token expira durante o processamento dos demais itens.)
      let arquivosHospedados: ArquivoHospedado[] = [];
      if (arquivos.length && bearerToken) {
        try {
          arquivosHospedados = await hospedarArquivos(arquivos, { Authorization: bearerToken });
        } catch {
          arquivosHospedados = arquivos;
        }
      } else {
        arquivosHospedados = arquivos;
      }

      mappedItems.push({
        titulo,
        link,
        status: "Aberto",
        data_fechamento,
        descricao,
        valorTexto,
        periodoTexto,
        areaTematica,
        publicoAlvo,
        odsTexto,
        whatsapp,
        siteOficial,
        arquivos: arquivosHospedados.map((a) => ({ tipo: a.tipo || "pdf", url: a.url, titulo: a.titulo }))
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