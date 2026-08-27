import { TECHNOLOGY_QUERIES } from "../config/searchQueries.js";

export interface SearchCandidate {
  titulo?: string | null;
  descricao?: string | null;
  area_tematica?: string | null;
  publico_alvo?: string | null;
}

export interface RelevanceResult {
  accepted: boolean;
  score: number;
  terms: string[];
  fields: string[];
  reason: string;
}

const FIELD_WEIGHTS: Record<string, number> = {
  titulo: 8,
  descricao: 4,
  area_tematica: 3,
  publico_alvo: 1
};

const PRESET_RULES: Record<string, { terms: string[]; minimum: number }> = {
  software: { terms: ["desenvolvimento de software", "fabrica de software", "sustentacao de sistemas", "desenvolvimento de sistemas", "sustentacao de software", "evolucao de sistemas", "squad de ti"], minimum: 8 },
  ia: { terms: ["inteligencia artificial", "ia generativa", "ia", "machine learning", "aprendizado de maquina", "deep learning", "llm", "chatbot", "assistente virtual", "processamento de linguagem natural", "visao computacional", "reconhecimento de voz"], minimum: 8 },
  nuvem: { terms: ["computacao em nuvem", "cloud computing", "servicos em nuvem", "iaas", "paas", "saas", "nuvem publica", "infraestrutura de tic", "data center", "migracao para nuvem", "kubernetes", "docker", "devops"], minimum: 8 },
  dados: { terms: ["business intelligence", "inteligencia de negocios", "bi", "data warehouse", "data lake", "lakehouse", "etl", "elt", "engenharia de dados", "governanca de dados", "painel gerencial", "dashboard", "power bi", "tableau", "qlik", "modelagem dimensional", "banco de dados analitico", "analytics"], minimum: 8 },
  ciberseguranca: { terms: ["ciberseguranca", "seguranca da informacao", "seguranca cibernetica", "soc", "siem", "firewall", "antimalware", "antivirus", "pentest", "teste de invasao", "gestao de vulnerabilidades", "lgpd", "protecao de dados pessoais", "dlp", "iam", "pam", "resposta a incidentes"], minimum: 8 },
  ust: { terms: ["unidade de servico tecnico", "unidade de servico tecnologica", "ust", "ponto de funcao", "pontos de funcao", "analise de pontos de funcao", "apf", "metrica de software", "contagem de funcao"], minimum: 8 },
  consultoria: { terms: ["governanca de ti", "governanca de tic", "itil", "cobit", "gestao de servicos de ti", "planejamento diretor de ti", "pdti", "pdtic", "consultoria em tecnologia", "arquitetura corporativa de ti", "gestao de ativos de ti", "gerenciamento de projetos de tecnologia"], minimum: 8 },
  hardware: { terms: ["servidor", "workstation", "computador", "notebook", "switch", "roteador", "storage", "appliance", "equipamento de informatica", "periferico", "licenca de software", "licenciamento de software", "subscricao de software", "microsoft 365", "windows server", "oracle", "vmware", "adobe", "antivirus corporativo"], minimum: 8 }
};

function normalize(value: unknown): string { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function fields(candidate: SearchCandidate): Record<string, string> { return { titulo: normalize(candidate.titulo), descricao: normalize(candidate.descricao), area_tematica: normalize(candidate.area_tematica), publico_alvo: normalize(candidate.publico_alvo) }; }
function matches(text: string, term: string): boolean { const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text); }

export function scorePreset(candidate: SearchCandidate, presetId: string): RelevanceResult {
  const rule = PRESET_RULES[presetId] || { terms: TECHNOLOGY_QUERIES.find((item) => item.id === presetId)?.terms.map(normalize) || [], minimum: 8 };
  const values = fields(candidate); const found = new Set<string>(); const foundFields = new Set<string>(); let score = 0;
  for (const term of rule.terms.map(normalize)) {
    for (const [field, text] of Object.entries(values)) if (matches(text, term)) { found.add(term); foundFields.add(field); score += FIELD_WEIGHTS[field] * (term.length <= 3 ? 1.5 : 1); break; }
  }
  return { accepted: score >= rule.minimum, score, terms: [...found], fields: [...foundFields], reason: found.size ? `${[...found].join(", ")} em ${[...foundFields].join(", ")}` : "nenhum termo técnico encontrado" };
}

export function scoreFreeText(candidate: SearchCandidate, rawQuery: string): RelevanceResult {
  const query = normalize(rawQuery); if (!query) return { accepted: true, score: 0, terms: [], fields: [], reason: "busca livre vazia" };
  const values = fields(candidate); const terms = query.split(/\s+/).filter(Boolean); const found: string[] = []; const foundFields: string[] = []; let score = 0;
  if (query === "ia") {
    const aliases = ["ia", "inteligencia artificial", "ia generativa", "machine learning", "aprendizado de maquina", "deep learning", "llm", "chatbot", "assistente virtual", "processamento de linguagem natural", "visao computacional", "reconhecimento de voz"];
    for (const alias of aliases) for (const [field, value] of Object.entries(values)) if (matches(value, alias)) { found.push(alias); foundFields.push(field); score += FIELD_WEIGHTS[field] + alias.length; break; }
    return { accepted: found.length > 0, score, terms: [...new Set(found)], fields: [...new Set(foundFields)], reason: found.length ? `${[...new Set(found)].join(", ")} em ${[...new Set(foundFields)].join(", ")}` : "IA não encontrada em campos relevantes" };
  }
  if (terms.length > 1) {
    for (const [field, value] of Object.entries(values)) if (matches(value, query)) { return { accepted: true, score: FIELD_WEIGHTS[field] + query.length, terms: [query], fields: [field], reason: `${query} em ${field}` }; }
    return { accepted: false, score: 0, terms: [], fields: [], reason: "frase não encontrada em campos relevantes" };
  }
  for (const term of terms) for (const [field, text] of Object.entries(values)) if (matches(text, term)) { found.push(term); foundFields.push(field); score += FIELD_WEIGHTS[field]; break; }
  return { accepted: found.length > 0, score, terms: [...new Set(found)], fields: [...new Set(foundFields)], reason: found.length ? `${[...new Set(found)].join(", ")} em ${[...new Set(foundFields)].join(", ")}` : "termos não encontrados em campos relevantes" };
}

export function scoreCandidate(candidate: SearchCandidate, mode: string, text: string): RelevanceResult {
  if (mode && text.trim()) {
    const preset = scorePreset(candidate, mode); const free = scoreFreeText(candidate, text);
    return { accepted: preset.accepted && free.accepted, score: preset.score + free.score, terms: [...new Set([...preset.terms, ...free.terms])], fields: [...new Set([...preset.fields, ...free.fields])], reason: `${preset.reason}; ${free.reason}` };
  }
  if (mode) return scorePreset(candidate, mode);
  return scoreFreeText(candidate, text);
}
