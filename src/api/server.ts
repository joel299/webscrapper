import fastify from "fastify";
import basicAuth from "@fastify/basic-auth";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "../config/env.js";
import { registerRoutes } from "./routes/index.js";

export async function buildServer() {
  const app = fastify({ logger: true });

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
    const url = request.raw.url ?? "";
    if (url.startsWith("/docs")) {
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
      servers: [{ url: "http://localhost:3001" }],
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

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    transformSpecification: (swaggerObject, request) => {
      const proto = (request.headers["x-forwarded-proto"] as string) ?? request.protocol ?? "http";
      const host = request.headers.host ?? "localhost";
      return {
        ...swaggerObject,
        servers: [{ url: `${proto}://${host}` }]
      };
    }
  });

  await registerRoutes(app);

  return app;
}
