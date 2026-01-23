import { FastifyInstance } from "fastify";
import { listEditais, getEditalById } from "../../db/repositories/editais.js";

export async function editaisRoutes(app: FastifyInstance) {
  app.get("/", {
    schema: {
      summary: "Buscar editais",
      description: "Lista editais ja coletados no banco. Nao realiza scraping em tempo real.",
      querystring: {
        type: "object",
        properties: {
          fonte: { type: "string" },
          status: { type: "string" },
          publico_alvo: { type: "string" },
          data_abertura_inicio: { type: "string", format: "date" },
          data_fechamento_fim: { type: "string", format: "date" },
          texto: { type: "string" },
          page: { type: "integer", default: 1 },
          limit: { type: "integer", default: 20 }
        }
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
                  data_fechamento: { type: ["string", "null"], format: "date" }
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

  app.get("/:id", {
    schema: {
      summary: "Leitura completa do edital",
      description: "Retorna os detalhes do edital armazenado no banco.",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", format: "uuid" } }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const edital = await getEditalById(id);
    if (!edital) {
      reply.code(404);
      return { message: "Edital nao encontrado" };
    }
    return edital;
  });
}
