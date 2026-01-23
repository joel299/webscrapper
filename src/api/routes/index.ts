import { FastifyInstance } from "fastify";
import { editaisRoutes } from "./editais.js";
import { internalRoutes } from "./internal.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(editaisRoutes, { prefix: "/api/editais" });
  await app.register(internalRoutes, { prefix: "/api/internal" });
}
