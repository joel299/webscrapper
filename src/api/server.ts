import fastify from "fastify";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import basicAuth from "@fastify/basic-auth";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import { env } from "../config/env.js";
import { registerRoutes } from "./routes/index.js";

export async function buildServer() {
  const app = fastify({ logger: true });
  const frontendPath = fileURLToPath(new URL("../../public/index.html", import.meta.url));

  await app.register(cors, { origin: true });

  await app.register(basicAuth, {
    validate(username, password, req, reply, done) {
      const ok = username === env.BASIC_AUTH_USER && password === env.BASIC_AUTH_PASS;
      if (!ok) {
        done(new Error("Unauthorized"));
        return;
      }
      done();
    }
  });

  app.addHook("onRequest", (request, reply, done) => {
    if (request.method === "OPTIONS") {
      done();
      return;
    }
    const url = request.raw.url ?? "";
    const pathname = url.split("?", 1)[0];
    const isPublicRead = request.method === "GET" && (
      pathname === "/api/editais" ||
      pathname.startsWith("/api/editais/")
    );
    if (url === "/" || url === "/webscrapper" || url === "/webscrapper/" || url.startsWith("/docs") || url === "/openapi.json" || isPublicRead) {
      done();
      return;
    }
    app.basicAuth(request, reply, done);
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "API de Editais e Licitacoes",
        description: "API responsavel por coletar, normalizar e disponibilizar editais publicos",
        version: "1.0.0"
      },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: {
          BasicAuth: {
            type: "http",
            scheme: "basic"
          }
        }
      },
      security: [{ BasicAuth: [] }]
    }
  });

  app.get("/openapi.json", async () => app.swagger());

  const serveFrontend = async (_request: unknown, reply: { type: (value: string) => { send: (value: string) => void } }) => {
    reply.type("text/html").send(await readFile(frontendPath, "utf8"));
  };

  app.get("/", serveFrontend);
  app.get("/webscrapper", serveFrontend);
  app.get("/webscrapper/", serveFrontend);

  app.get("/docs", async (_request, reply) => {
    reply.type("text/html").send(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><title>API de Editais</title></head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`);
  });

  await registerRoutes(app);

  return app;
}
