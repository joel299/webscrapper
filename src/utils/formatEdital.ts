// Formata a descrição do edital no padrão do modelo de painel de edital.
// Estrutura: Informações Gerais → Finalidade/atuação → Requisitos → Acesso ao Edital.

import type { EditalRow } from "../db/types.js";

function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function bullets(items: Array<string | null | undefined>, limit = 40): string[] {
  return items.map((i) => clean(i)).filter((i) => i.length > 1).slice(0, limit);
}

export function formatEditalBody(edital: EditalRow): string {
  const lines: string[] = [];

  const titulo = clean(edital.titulo) || "Edital";
  lines.push(`# ${titulo}`);
  lines.push("");

  // --- Informações Gerais ---
  lines.push("## Informações Gerais");
  if (clean(edital.fonte)) lines.push(`- **Fonte:** ${clean(edital.fonte)}`);
  if (clean(edital.status)) lines.push(`- **Status:** ${clean(edital.status)}`);
  if (clean(edital.data_abertura)) lines.push(`- **Data de Abertura:** ${clean(edital.data_abertura)}`);
  if (clean(edital.data_fechamento)) lines.push(`- **Data de Fechamento / Inscrições:** ${clean(edital.data_fechamento)}`);
  if (clean(edital.valor_texto)) lines.push(`- **Recursos / Valor Total:** ${clean(edital.valor_texto)}`);
  if (clean(edital.periodo_texto)) lines.push(`- **Período de Inscrição:** ${clean(edital.periodo_texto)}`);
  if (clean(edital.area_tematica)) lines.push(`- **Áreas de Atuação:** ${clean(edital.area_tematica)}`);
  if (clean(edital.publico_alvo)) lines.push(`- **Público-Alvo:** ${clean(edital.publico_alvo)}`);
  if (clean(edital.ods_texto)) lines.push(`- **Objetivos de Desenvolvimento Sustentável (ODS):** ${clean(edital.ods_texto)}`);

  // --- Finalidade / Descrição ---
  if (clean(edital.descricao)) {
    lines.push("");
    lines.push("## Finalidade e Modelo de Atuação");
    lines.push(clean(edital.descricao));
  }

  // --- Requisitos / Elegibilidade ---
  if (clean(edital.elegibilidade) || clean(edital.publico_alvo)) {
    lines.push("");
    lines.push("## Requisitos de Participação");
    if (clean(edital.elegibilidade)) {
      lines.push(`- **Critérios de Elegibilidade:** ${clean(edital.elegibilidade)}`);
    }
    if (clean(edital.publico_alvo)) {
      lines.push(`- **Público-Alvo:** ${clean(edital.publico_alvo)}`);
    }
  }

  // --- Contatos ---
  const emails = bullets((edital.contatos?.email ?? []) as Array<string | null | undefined>);
  const telefones = bullets((edital.contatos?.telefone ?? []) as Array<string | null | undefined>);
  const celular = bullets((edital.contatos?.celular ?? []) as Array<string | null | undefined>);
  if (emails.length || telefones.length || celular.length || clean(edital.whatsapp)) {
    lines.push("");
    lines.push("## Contatos");
    if (clean(edital.whatsapp)) lines.push(`- **WhatsApp:** ${clean(edital.whatsapp)}`);
    for (const e of emails) lines.push(`- **E-mail:** ${e}`);
    for (const t of telefones) lines.push(`- **Telefone:** ${t}`);
    for (const c of celular) lines.push(`- **Celular:** ${c}`);
  }

  // --- Acesso ao Edital ---
  const accessLinks: string[] = [];
  if (clean(edital.link_pdf)) accessLinks.push(`- **Edital (PDF):** ${clean(edital.link_pdf)}`);
  if (clean(edital.site_oficial)) accessLinks.push(`- **Site / Portal oficial:** ${clean(edital.site_oficial)}`);
  if (clean(edital.link_edital)) accessLinks.push(`- **Página da fonte:** ${clean(edital.link_edital)}`);
  const arquivos = ((edital.arquivos ?? []) as Array<{ titulo?: string | null; url?: string | null }>).filter((a) => a && clean(a.url));
  if (arquivos.length) {
    for (const a of arquivos.slice(0, 12)) {
      const label = clean(a.titulo) || "Anexo";
      accessLinks.push(`- **${label}:** ${clean(a.url)}`);
    }
  }
  if (accessLinks.length) {
    lines.push("");
    lines.push("## Acesso ao Edital e Documentos");
    lines.push(...accessLinks);
  }

  return lines.join("\n");
}
