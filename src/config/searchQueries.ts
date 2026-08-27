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
    terms: ["inteligência artificial", "IA", "IA generativa", "machine learning", "aprendizado de máquina", "deep learning", "LLM", "chatbot", "assistente virtual", "processamento de linguagem natural", "visão computacional", "reconhecimento de voz"]
  },
  {
    id: "nuvem",
    label: "Computação em Nuvem e Infraestrutura",
    terms: ["computação em nuvem", "cloud computing", "serviços em nuvem", "IaaS", "PaaS", "SaaS", "nuvem pública", "infraestrutura de TIC", "data center", "migração para nuvem", "Kubernetes", "Docker", "DevOps"]
  },
  {
    id: "dados",
    label: "Projetos de Dados e BI",
    terms: ["business intelligence", "inteligência de negócios", "BI", "data warehouse", "data lake", "lakehouse", "ETL", "ELT", "engenharia de dados", "governança de dados", "painel gerencial", "dashboard", "Power BI", "Tableau", "Qlik", "modelagem dimensional", "banco de dados analítico", "analytics"]
  },
  {
    id: "ciberseguranca",
    label: "Cibersegurança e Proteção de Dados",
    terms: ["cibersegurança", "segurança da informação", "segurança cibernética", "SOC", "SIEM", "firewall", "antimalware", "antivírus", "pentest", "teste de invasão", "gestão de vulnerabilidades", "LGPD", "proteção de dados pessoais", "DLP", "IAM", "PAM", "resposta a incidentes"]
  },
  {
    id: "ust",
    label: "Contratos por UST ou Pontos de Função",
    terms: ["unidade de serviço técnico", "unidade de serviço tecnológica", "UST", "ponto de função", "pontos de função", "análise de pontos de função", "APF", "métrica de software", "contagem de função"]
  },
  {
    id: "consultoria",
    label: "Consultoria e Governança de TI",
    terms: ["consultoria de TIC", "consultoria de tecnologia", "governança de TI", "service desk", "suporte técnico", "outsourcing de TI", "gestão de serviços de TI", "PDTIC", "planejamento de TIC", "help desk", "sustentação de infraestrutura"]
  },
  {
    id: "hardware",
    label: "Hardware e Licenciamento",
    terms: ["servidor", "workstation", "computador", "notebook", "switch", "roteador", "storage", "appliance", "equipamento de informática", "periférico", "licença de software", "licenciamento de software", "subscrição de software", "Microsoft 365", "Windows Server", "Oracle", "VMware", "Adobe", "antivírus corporativo"]
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
