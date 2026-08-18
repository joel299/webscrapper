import { FastifyInstance } from "fastify";
import { listEditais, listEditalSources, getEditalById } from "../../db/repositories/editais.js";
import { availableSources } from "../../scrapers/run.js";
import { fetchEditalDetail } from "../../scrapers/detail.js";
import { formatEditalBody } from "../../utils/formatEdital.js";
import { TECHNOLOGY_QUERIES } from "../../config/searchQueries.js";
import { requestAnalysis, listAnalyses, enqueuePendingAnalyses } from "../../analysis/editalAnalysis.js";
import { enqueueAnalysis } from "../../workers/queue.js";

export async function editaisRoutes(app: FastifyInstance) {
  app.get("/", {
    schema: {
      summary: "Buscar editais",
      description: "Lista editais ja coletados no banco. Nao realiza scraping em tempo real.",
      querystring: {
        type: "object",
        properties: {
          fonte: { type: "string", maxLength: 100 },
          status: { type: "string", maxLength: 50 },
          publico_alvo: { type: "string", maxLength: 200 },
          data_abertura_inicio: { type: "string", format: "date" },
          data_fechamento_inicio: { type: "string", format: "date" },
          data_fechamento_fim: { type: "string", format: "date" },
          texto: { type: "string", maxLength: 200 },
          modo: { type: "string", maxLength: 50 },
          page: { type: "integer", minimum: 1, maximum: 10_000, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
        },
        additionalProperties: false
      },
      response: {
        200: {
          description: "Lista paginada de editais.",
          type: "object",
          properties: {
            total: { type: "integer" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  fonte: { type: "string" },
                  titulo: { type: "string" },
                  link_edital: { type: "string" },
                  link_pdf: { type: ["string", "null"] },
                  status: { type: ["string", "null"] },
                  data_fechamento: { type: ["string", "null"], format: "date" },
                  descricao: { type: ["string", "null"] },
                  valor_texto: { type: ["string", "null"] },
                  periodo_texto: { type: ["string", "null"] },
                  area_tematica: { type: ["string", "null"] },
                  publico_alvo: { type: ["string", "null"] },
                  ods_texto: { type: ["string", "null"] },
                  whatsapp: { type: ["string", "null"] },
                  site_oficial: { type: ["string", "null"] },
                  analysis_status: { type: ["string", "null"] },
                  analysis_id: { type: ["string", "null"] }
                }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    const result = await listEditais(request.query as Record<string, unknown>);
    void enqueuePendingAnalyses(100).catch((err) => app.log.warn({ err }, "Falha ao enfileirar análises pendentes"));
    return result;
  });

  app.get("/sources", {
    schema: {
      summary: "Listar fontes disponíveis",
      description: "Retorna as fontes configuradas e as fontes já presentes no banco.",
      response: { 200: { type: "object", properties: { sources: { type: "array", items: { type: "string" } } } } }
    }
  }, async () => {
    const storedSources = await listEditalSources();
    return { sources: [...new Set([...availableSources, ...storedSources])] };
  });

  app.get("/modos", {
    schema: {
      summary: "Queries prontas de busca de tecnologia",
      description: "Retorna os modos de busca prontos (booleans) da planilha Guia de Portais e APIs para Licitações de Tecnologia.",
      response: {
        200: {
          type: "object",
          properties: {
            modos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  terms: { type: "array", items: { type: "string" } }
                }
              }
            }
          }
        }
      }
    }
  }, async () => {
    return { modos: TECHNOLOGY_QUERIES };
  });

  app.post("/:id(^[-a-fA-F0-9]{36}$)/analysis", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { analysis, cached } = await requestAnalysis(id, "aderencia");
      if (!cached) {
        const job = await enqueueAnalysis(analysis.id);
        return reply.code(202).send({ analysis_id: analysis.id, job_id: job.id, status: "queued", cached: false });
      }
      return { analysis_id: analysis.id, status: analysis.status, cached: true, resultado: analysis.resultado };
    } catch (e: any) {
      return reply.code(400).send({ message: e.message });
    }
  });

  app.get("/:id(^[-a-fA-F0-9]{36}$)/analysis", async (request) => {
    const { id } = request.params as { id: string };
    return { analyses: await listAnalyses(id) };
  });

  app.get("/:id(^[-a-fA-F0-9]{36}$)/analysis/:analysisId", async (request, reply) => {
    const { analysisId } = request.params as { analysisId: string };
    const rows = await listAnalyses((request.params as { id: string }).id);
    const analysis = rows.find((x) => x.id === analysisId);
    if (!analysis) return reply.code(404).send({ message: "Análise não encontrada" });
    return analysis;
  });


  app.get("/:id(^[-a-fA-F0-9]{36}$)", {
    schema: {
      summary: "Leitura completa do edital",
      description: "Retorna os detalhes do edital armazenado no banco.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", format: "uuid" } },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let edital = await getEditalById(id);
    if (!edital) {
      reply.code(404);
      return { message: "Edital nao encontrado" };
    }
    if ((!edital.descricao || !edital.data_fechamento) && edital.link_edital) {
      try {
        const external = await fetchEditalDetail(edital.link_edital);
        edital = {
          ...edital,
          descricao: edital.descricao || external.descricao || external.texto_completo,
          data_fechamento: edital.data_fechamento
        };
      } catch {
        // keep as-is
      }
    }
    // Texto estruturado no padrão do painel de edital (modelo anexado)
    const texto_painel = formatEditalBody(edital);
    return { ...edital, texto_painel };
  });
}
