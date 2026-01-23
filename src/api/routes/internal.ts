import { FastifyInstance } from "fastify";
import { enqueueScraperRun, getScraperJobStatus } from "../../workers/queue.js";
import { fetchEditalDetail } from "../../scrapers/detail.js";

export async function internalRoutes(app: FastifyInstance) {
  app.post("/scraper/run", {
    schema: {
      summary: "Executar scraping manual (interno)",
      description: "Enfileira um job de scraping. A API nao executa scraping em tempo real.",
      tags: ["internal"],
      body: {
        type: "object",
        properties: {
          fonte: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body as { fonte?: string };
    const job = await enqueueScraperRun(body.fonte ?? "all");
    reply.code(202);
    return { status: "queued", jobId: String(job.id), queuedAt: new Date(job.timestamp).toISOString() };
  });

  app.get("/scraper/status/:id", {
    schema: {
      summary: "Status do scraping (interno)",
      description: "Consulta o status de um job enfileirado no BullMQ.",
      tags: ["internal"],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } }
      },
      response: {
        200: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            state: { type: "string" },
            progress: { type: ["number", "object", "null"] },
            failedReason: { type: ["string", "null"] },
            stacktrace: { type: "array", items: { type: "string" } },
            queuedAt: { type: ["string", "null"], format: "date-time" },
            processedAt: { type: ["string", "null"], format: "date-time" },
            finishedAt: { type: ["string", "null"], format: "date-time" },
            durationMs: { type: ["number", "null"] }
          }
        },
        404: {
          type: "object",
          properties: { message: { type: "string" } }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const status = await getScraperJobStatus(id);
    if (!status) {
      reply.code(404);
      return { message: "Job nao encontrado" };
    }
    return status;
  });

  app.post("/scraper/detail", {
    schema: {
      summary: "Extrair detalhes do edital por link (interno)",
      description: "Busca o link ao vivo para extrair texto, contatos e arquivos. Nao salva no banco.",
      tags: ["internal"],
      body: {
        type: "object",
        required: ["url"],
        properties: { url: { type: "string" } }
      },
      response: {
        200: {
          type: "object",
          properties: {
            url: { type: "string" },
            titulo: { type: ["string", "null"] },
            descricao: { type: ["string", "null"] },
            area_tematica: { type: ["string", "null"] },
            texto_completo: { type: ["string", "null"] },
            subareas: { type: "array", items: { type: "string" } },
            contatos: {
              type: "object",
              properties: {
                email: { type: "array", items: { type: "string" } },
                telefone: { type: "array", items: { type: "string" } },
                celular: { type: "array", items: { type: "string" } }
              }
            },
            arquivos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tipo: { type: "string" },
                  url: { type: "string" },
                  titulo: { type: ["string", "null"] }
                }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    const body = request.body as { url: string };
    return fetchEditalDetail(body.url);
  });
}
