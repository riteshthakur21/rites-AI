import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import jwt from "@fastify/jwt";
import { config } from "./config.js";
import { SqliteStore, VectorStore } from "./db.js";
import { createEmbeddingProvider, createLlmProvider } from "./providers.js";
import { RagEngine } from "./rag.js";
import { registerRoutes } from "./routes.js";
import { ZodError } from "zod";

const start = async () => {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug"
    }
  });

  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(helmet);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(multipart);
  await app.register(jwt, { secret: config.JWT_SECRET });

  app.decorate("authenticate", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  const store = new SqliteStore(config.SQLITE_PATH);
  const vectors = new VectorStore();
  await vectors.init(config.VECTOR_PATH);

  const embedder = createEmbeddingProvider(config.DEFAULT_EMBED_PROVIDER);
  const llm = createLlmProvider(config.DEFAULT_LLM_PROVIDER);
  const rag = new RagEngine(store, vectors, embedder, llm);
  await rag.bootstrap();

  registerRoutes(app, { store, rag });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({ error: "Invalid request", details: err.flatten() });
      return;
    }
    app.log.error(err);
    reply.code(500).send({ error: "Internal Server Error" });
  });

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`API running on http://localhost:${config.PORT}`);
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
