import { chromium, type BrowserContext, type Download, type Frame, type Page } from "playwright";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { upsertEditaisFromList, type EditalDocument, type EditalRichItem } from "../../db/repositories/editais.js";

const execFileAsync = promisify(execFile);
export const COMPRAS_BR_LIST_URL = "https://comprasbr.com.br/pregao-eletronico/?objeto=IA&status=ABERTO";
export const COMPRAS_BR_SOURCE_CODE = "COMPRAS_BR";
export const COMPRAS_BR_SOURCE_NAME = "Compras BR";
export const COMPRAS_BR_SOURCE_TYPE = "licitacao";
const DETAIL_URL = "https://comprasbr.com.br/pregao-eletronico-detalhe/?idlicitacao=";
const MAX_PAGES = 100;
const MAX_DOCUMENTS = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface ComprasBrListItem {
  numero_edital: string;
  objeto_resumido: string;
  data_hora: string;
  orgao: string;
  municipio: string;
  estado: string;
  modalidade: string;
  status: string;
  pagina: number;
  indice: number;
}

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function parseDate(value: string) { const m = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null; }
function hashContent(parts: string[]) { return createHash("sha256").update(parts.join("\n\n")).digest("hex"); }
function labelValue(text: string, label: string) { const lines = text.split(/\n+/).map(clean).filter(Boolean); const index = lines.findIndex((line) => new RegExp(`^${label}\\s*:??`, "i").test(line)); if (index < 0) return ""; const sameLine = lines[index].replace(new RegExp(`^${label}\\s*:?`, "i"), "").trim(); return clean(sameLine || lines[index + 1] || ""); }

async function waitFrame(page: Page): Promise<Frame> {
  await page.waitForSelector("iframe#iframe-processos", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(1000);
  const frame = page.frames().find((f) => f.url().includes("app.comprasbr.com.br/licitacao-pub"));
  if (!frame) throw new Error("Iframe do Compras BR não carregou");
  return frame;
}

export async function extractComprasBrList(frame: Frame, pagina: number): Promise<ComprasBrListItem[]> {
  await frame.locator(".processo-card-acessar").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const empty = await frame.getByText("Não foram encontrados registros!", { exact: false }).count();
  if (empty) return [];
  return frame.locator(".processo-card-acessar").evaluateAll((buttons, page) => buttons.map((button, index) => {
    const card = button.closest(".processo-card") || button.closest(".card, article, [class*=processo]") || button.parentElement;
    const lines = ((card as HTMLElement)?.innerText || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const numberIndex = lines.findIndex((line) => /^Nº\s+/i.test(line));
    const dateIndex = lines.findIndex((line) => /\d{1,2}\/\d{1,2}\/\d{4}.*\d{1,2}:\d{2}/.test(line));
    const locationIndex = lines.findIndex((line) => /location_on/i.test(line));
    const modalityIndex = lines.findIndex((line) => /filter_alt/i.test(line));
    const statusIndex = lines.findIndex((line) => /^(Aberto|Fechado|Suspenso)$/i.test(line));
    const location = (lines[locationIndex] || "").replace(/^location_on/i, "").trim();
    const locationParts = location.match(/^(.*?)(?:\s+-\s+)([A-Z]{2})$/);
    return { numero_edital: (lines[numberIndex] || "").replace(/^Nº\s*/i, "").trim(), objeto_resumido: lines.slice(numberIndex + 1, dateIndex > numberIndex ? dateIndex : lines.length).join(" ").trim(), data_hora: lines[dateIndex] || "", orgao: locationParts?.[1] || location, municipio: "", estado: locationParts?.[2] || "", modalidade: (lines[modalityIndex] || "").replace(/^filter_alt/i, "").trim(), status: lines[statusIndex] || "", pagina: page as number, indice: index };
  }), pagina);
}

async function expandDescription(frame: Frame) {
  const more = frame.locator(".btn-ver-mais-objeto").first();
  if (await more.count()) await more.click().catch(() => {});
  await frame.waitForTimeout(150);
}

function normalizedText(pageText: string, docs: EditalDocument[]) {
  const lines = pageText.split(/\n+/).map(clean).filter(Boolean).filter((line) => !/^(participar do processo|cadastrar agora|garantir participação|quero participar|baixar)$/i.test(line));
  const unique: string[] = []; const seen = new Set<string>();
  for (const line of lines) { const key = line.toLowerCase(); if (!seen.has(key)) { seen.add(key); unique.push(line); } }
  const docText = docs.filter((d) => d.texto_extraido).map((d) => `DOCUMENTO: ${d.tipo.toUpperCase()}\n${d.texto_extraido}`).join("\n\n");
  return `DADOS DA OPORTUNIDADE\n\n${unique.slice(0, 180).join("\n")}\n\nOBJETO COMPLETO\n\n${unique.slice(0, 35).join(" ")}\n\n${docText || "DOCUMENTOS\n\nNão localizado no material analisado."}`.trim();
}

async function extractPdf(filePath: string): Promise<string> {
  try { const result = await execFileAsync("pdftotext", ["-layout", filePath, "-"]); if (result.stdout.trim()) return result.stdout.replace(/\f/g, "\n").replace(/\n{3,}/g, "\n\n").trim(); } catch { /* OCR abaixo */ }
  const ocrDir = await mkdtemp(path.join(os.tmpdir(), "compras-br-ocr-"));
  try {
    await execFileAsync("pdftoppm", ["-jpeg", "-r", "150", filePath, path.join(ocrDir, "page")], { timeout: 120000 });
    const { stdout } = await execFileAsync("sh", ["-c", `for f in "${ocrDir}"/page-*.jpg; do tesseract "$f" stdout -l por 2>/dev/null || tesseract "$f" stdout 2>/dev/null; done`], { timeout: 180000 });
    return stdout.replace(/\n{3,}/g, "\n\n").trim();
  } catch { return ""; } finally { await rm(ocrDir, { recursive: true, force: true }); }
}

async function extractDocumentText(filePath: string, mime: string, name: string): Promise<string> {
  if (/pdf/i.test(mime) || /\.pdf$/i.test(name)) return extractPdf(filePath);
  if (/word|docx/i.test(mime) || /\.docx$/i.test(name)) { try { const { stdout } = await execFileAsync("sh", ["-c", `unzip -p "${filePath}" word/document.xml | sed 's/<[^>]*>/ /g'`]); return stdout.replace(/\s+/g, " ").trim(); } catch { return ""; } }
  if (/sheet|excel|xlsx/i.test(mime) || /\.xlsx$/i.test(name)) { try { const { stdout } = await execFileAsync("sh", ["-c", `unzip -p "${filePath}" xl/sharedStrings.xml xl/worksheets/sheet*.xml | sed 's/<[^>]*>/ /g'`]); return stdout.replace(/\s+/g, " ").trim(); } catch { return ""; } }
  return "";
}

async function downloadDocument(page: Page, frame: Frame, button: ReturnType<Frame["locator"]>, meta: { nome: string; tipo: string; data_publicacao: string }): Promise<EditalDocument> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "compras-br-doc-")); const filePath = path.join(dir, "document");
  try {
    let download: Download | null = null; let responseBody: Buffer | null = null;
    try {
      const responsePromise = page.waitForResponse((response) => response.url().includes("/licitacao/hal/public/arquivos") && response.status() === 200, { timeout: 30000 });
      [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), button.click()]);
      const response = await responsePromise; responseBody = await response.body();
    } catch { await button.click().catch(() => {}); }
    if (!download) return { ...meta, url_origem: "", mime_type: "", tamanho_bytes: 0, sha256: "", status_download: "failed", texto_extraido: "", erro: "download não capturado" };
    const suggested = download.suggestedFilename(); const target = path.join(dir, suggested || "document"); let bytes: Buffer;
    if (responseBody?.length) bytes = responseBody; else if (download.url()) { const response = await page.context().request.get(download.url(), { timeout: 60000 }); bytes = response.ok() ? await response.body() : Buffer.alloc(0); } else try { const sourcePath = await download.path(); bytes = sourcePath ? await readFile(sourcePath) : Buffer.alloc(0); } catch { const stream = await download.createReadStream(); if (!stream) throw new Error("stream de download indisponível"); const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); bytes = Buffer.concat(chunks); }
    if (!bytes.length) throw new Error("download vazio"); await writeFile(target, bytes);
    if (bytes.byteLength > MAX_FILE_BYTES) return { ...meta, url_origem: download.url(), mime_type: "", tamanho_bytes: bytes.byteLength, sha256: "", status_download: "failed", texto_extraido: "", erro: "arquivo excede limite" };
    const sha256 = createHash("sha256").update(bytes).digest("hex"); const texto = await extractDocumentText(target, "", suggested);
    return { ...meta, nome: suggested || meta.nome, url_origem: download.url(), mime_type: /\.pdf$/i.test(suggested) ? "application/pdf" : "application/octet-stream", tamanho_bytes: bytes.byteLength, sha256, status_download: "complete", texto_extraido: texto };
  } catch (error) {
    return { ...meta, url_origem: "", mime_type: "", tamanho_bytes: 0, sha256: "", status_download: "failed", texto_extraido: "", erro: String(error) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export async function extractComprasBrDetail(page: Page, frame: Frame, listItem: ComprasBrListItem): Promise<EditalRichItem> {
  await expandDescription(frame); const text = await frame.locator("body").innerText(); const url = frame.url(); const externalId = new URL(url).searchParams.get("id") || url.match(/detalhe\/(\d+)/)?.[1] || "";
  const docs: EditalDocument[] = []; const rows = frame.locator(".botao-baixar-doc"); const count = Math.min(await rows.count(), MAX_DOCUMENTS);
  for (let i = 0; i < count; i++) { const row = rows.nth(i); const parent = row.locator("xpath=ancestor::tr[1]"); const cells = await parent.locator("td").allTextContents().catch(() => [] as string[]); docs.push(await downloadDocument(page, frame, row, { nome: clean(cells[0]) || `Documento ${i + 1}`, tipo: clean(cells[1]) || "Outro", data_publicacao: clean(cells[2]) || "" })); }
  const normalized = normalizedText(text, docs); const titulo = clean(text.split("\n").find((line) => line.length > 20) || listItem.objeto_resumido) || `Pregão ${listItem.numero_edital}`;
  const externalIdValue = externalId || listItem.numero_edital;
  const completeDocs = docs.length > 0 && docs.every((d) => d.status_download === "complete"); const documentsStatus = completeDocs ? "complete" : docs.some((d) => d.status_download === "complete") ? "partial" : "failed";
  return { titulo, link: DETAIL_URL + encodeURIComponent(externalIdValue), status: clean(labelValue(text, "status")) || listItem.status || "Aberto", data_fechamento: parseDate(labelValue(text, "Fim de Envio de Propostas")), descricao: normalized, siteOficial: "https://comprasbr.com.br", arquivos: docs.map((d) => ({ tipo: d.tipo, url: d.url_origem, titulo: d.nome, texto_extraido: d.texto_extraido, sha256: d.sha256, mime_type: d.mime_type, tamanho_bytes: d.tamanho_bytes, status_download: d.status_download })), externalId: externalIdValue, canonicalKey: `${COMPRAS_BR_SOURCE_CODE}:${externalIdValue}`, sourceType: COMPRAS_BR_SOURCE_TYPE, documentsStatus, analysisStatus: "pending", numeroEdital: listItem.numero_edital, numeroProcesso: labelValue(text, "Nº do Processo"), orgao: labelValue(text, "órgão") || listItem.orgao, municipio: labelValue(text, "município") || listItem.municipio, estado: listItem.estado, modalidade: labelValue(text, "Modalidade") || listItem.modalidade, tipoJulgamento: labelValue(text, "Tipo"), tipoDisputa: labelValue(text, "Disputa"), pregoeiro: labelValue(text, "Pregoeiro"), legislacao: labelValue(text, "Legislação"), inicioEnvioPropostas: labelValue(text, "Início de Envio de Propostas"), fimEnvioPropostas: labelValue(text, "Fim de Envio de Propostas"), aberturaLicitacao: labelValue(text, "Abertura da Licitação"), andamento: extractAndamento(text), contentHash: hashContent([normalized, ...docs.map((d) => `${d.nome}:${d.sha256}:${d.texto_extraido}`)]) };
}

function extractAndamento(text: string) { const marker = text.indexOf("Andamento do Processo"); return marker >= 0 ? text.slice(marker + 22).slice(0, 12000).trim() : ""; }

export async function comprasBrScraper() {
  const browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } }); const page = await context.newPage(); const seen = new Set<string>(); const items: EditalRichItem[] = [];
  try {
    for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
      const url = COMPRAS_BR_LIST_URL; let success = false;
      for (let attempt = 0; attempt < 3 && !success; attempt++) { try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); const frame = await waitFrame(page); for (let currentPage = 1; currentPage <= pagina; currentPage++) { const list = await extractComprasBrList(frame, currentPage); if (!list.length) { if (currentPage === 1) console.log(JSON.stringify({ source: "COMPRAS_BR", success: true, items: [], reason: "no_results" })); return; } if (currentPage === pagina) { for (const listItem of list) { const button = frame.locator(".processo-card-acessar").nth(listItem.indice); await button.click(); await page.waitForTimeout(500); const detailFrame = await waitFrame(page); if (!detailFrame.url().includes("detalhe")) throw new Error("processo não navegou para detalhe"); const detail = await extractComprasBrDetail(page, detailFrame, listItem); if (!seen.has(detail.canonicalKey || detail.link)) { seen.add(detail.canonicalKey || detail.link); items.push(detail); } await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); await waitFrame(page); } } if (currentPage < pagina) { const next = frame.getByText(String(currentPage + 1), { exact: true }).last(); if (!(await next.count())) return; await next.click(); await frame.locator(".processo-card-acessar").first().waitFor({ state: "visible", timeout: 30000 }); } } success = true; } catch (error) { if (attempt === 2) console.error(`[compras_br] página ${pagina} falhou: ${String(error)}`); else await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))); } }
      if (!success) continue;
    }
    if (items.length) { const result = await upsertEditaisFromList("COMPRAS_BR", items); console.log(`[compras_br] itens=${items.length} upsert=${result.inserted}`); }
  } finally { await context.close(); await browser.close(); }
}

export async function runComprasBrWithContext(context: BrowserContext) { const page = await context.newPage(); try { await page.goto(COMPRAS_BR_LIST_URL, { waitUntil: "domcontentloaded", timeout: 60000 }); const frame = await waitFrame(page); return await extractComprasBrList(frame, 1); } finally { await page.close(); } }
