import { FastifyInstance } from "fastify";
import { listEditais, listEditalSources, getEditalById } from "../../db/repositories/editais.js";
import { availableSources } from "../../scrapers/run.js";
import { fetchEditalDetail } from "../../scrapers/detail.js";

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
                  site_oficial: { type: ["string", "null"] }
                }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    return listEditais(request.query as Record<string, unknown>);
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

  app.get("/:id", {
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
    const edital = await getEditalById(id);
    if (!edital) {
      reply.code(404);
      return { message: "Edital nao encontrado" };
    }
    if ((!edital.descricao || !edital.data_fechamento) && edital.link_edital) {
      try {
        const external = await fetchEditalDetail(edital.link_edital);
        return {
          ...edital,
          descricao: edital.descricao || external.descricao || external.texto_completo,
          data_fechamento: edital.data_fechamento
        };
      } catch {
        return edital;
      }
    }
    return edital;
  });
}
