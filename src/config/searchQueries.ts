// Queries booleanas prontas para busca de licitações de tecnologia,
// extraídas da aba "Queries Prontas para Busca" da planilha
// "Guia de Portais, APIs e Termos para Licitações de Tecnologia".
export const TECHNOLOGY_QUERIES: Array<{ id: string; label: string; terms: string[] }> = [
  {
    id: "software",
    label: "Fábrica e Desenvolvimento de Software",
    terms: ["desenvolvimento de software", "fábrica de software", "sustentação de sistemas", "desenvolvimento de sistemas", "sustentação de software", "evolução de sistemas", "squad de TI", "fábrica de software"]
  },
  {
    id: "ia",
    label: "Inteligência Artificial e Chatbots",
    terms: ["inteligência artificial", "chatbot", "assistente virtual", "automação de processos", "RPA", "machine learning", "processamento de linguagem natural", "IA generativa", "agente virtual", "LLM"]
  },
  {
    id: "nuvem",
    label: "Computação em Nuvem e Infraestrutura",
    terms: ["computação em nuvem", "cloud computing", "serviços em nuvem", "IaaS", "PaaS", "SaaS", "nuvem pública", "infraestrutura de TIC", "data center", "migração para nuvem", "Kubernetes", "Docker", "DevOps"]
  },
  {
    id: "dados",
    label: "Projetos de Dados e BI",
    terms: ["business intelligence", "data warehouse", "data lake", "engenharia de dados", "painéis gerenciais", "Power BI", "banco de dados", "big data", "dashboard", "BI", "ETL", "Metabase"]
  },
  {
    id: "ciberseguranca",
    label: "Cibersegurança e Proteção de Dados",
    terms: ["segurança da informação", "cibersegurança", "pentest", "teste de intrusão", "SOC", "SIEM", "LGPD", "firewall", "antiddos", "proteção de dados", "resposta a incidentes", "monitoramento de segurança"]
  },
  {
    id: "ust",
    label: "Contratos por UST ou Pontos de Função",
    terms: ["Unidade de Serviço Técnico", "UST", "Pontos de Função", "APF", "Análise de Pontos de Função", "IFPUG", "NESMA", "Story Points", "estimativa de software"]
  },
  {
    id: "consultoria",
    label: "Consultoria e Governança de TI",
    terms: ["consultoria de TIC", "consultoria de tecnologia", "governança de TI", "service desk", "suporte técnico", "outsourcing de TI", "gestão de serviços de TI", "PDTIC", "planejamento de TIC", "help desk", "sustentação de infraestrutura"]
  },
  {
    id: "hardware",
    label: "Hardware e Licenciamento",
    terms: ["licença de software", "subscrição de software", "servidores", "storage", "switches", "equipamentos de rede", "renovação de garantia", "parque tecnológico", "notebooks", "licenciamento perpétuo", "homologação técnica", "CATMAT", "CATSER"]
  }
];

// Termos-chave que indicam que o resultado é uma licitação/edital de tecnologia
export const EDITAL_INDICATOR_TERMS = [
  "edital", "licitação", "licitacao", "pregão", "pregao", "concorrência", "concorrencia",
  "chamamento público", "chamamento publico", "contratação", "contratacao", "técnica e preços",
  "credenciamento", "tomada de preços", "tomada de precos", "concurso", "convite",
  "ata de registro", "ata de registro de preços",
  // termos de tecnologia para reforçar relevância
  "software", "sistemas", "tecnologia", "TIC", "nuvem", "cloud", "inteligência artificial",
  "chatbot", "RPA", "segurança da informação", "cyber", "BI", "business intelligence",
  "pontos de função", "UST", "computação"
];
