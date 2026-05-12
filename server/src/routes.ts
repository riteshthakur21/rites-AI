import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { config } from "./config.js";
import { sanitizeInput } from "./utils.js";
import { createEmbeddingProvider, createLlmProvider } from "./providers.js";
import type { RagEngine } from "./rag.js";
import type { SqliteStore } from "./db.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = registerSchema;

const ingestSchema = z.object({
  title: z.string().min(2),
  text: z.string().min(10),
  source: z.string().optional().nullable()
});

const chatSchema = z.object({
  question: z.string().min(2),
  k: z.coerce.number().optional().default(4),
  conversationId: z.coerce.number().optional(),
  llmProvider: z.string().optional(),
  embedProvider: z.string().optional()
});

const toolSchema = z.object({
  name: z.enum(["searchDocs", "stats"]),
  args: z.record(z.any()).optional()
});

export const registerRoutes = (app: FastifyInstance, deps: { store: SqliteStore; rag: RagEngine }) => {
  const { store, rag } = deps;

  const resolveUserId = async (request: any) => {
    if (!request.headers.authorization) return null;
    try {
      await request.jwtVerify();
      return (request.user as { id: number }).id;
    } catch {
      return null;
    }
  };

  app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

  app.get("/api/models", async () => ({
    defaults: {
      embedProvider: config.DEFAULT_EMBED_PROVIDER,
      llmProvider: config.DEFAULT_LLM_PROVIDER
    },
    providers: {
      embed: ["ollama", "openai"],
      llm: ["ollama", "openai", "anthropic"]
    }
  }));

  app.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    if (store.findUserByEmail(body.email)) {
      reply.code(400);
      return { error: "Email already registered." };
    }
    const hash = await bcrypt.hash(body.password, 10);
    const id = store.createUser(body.email, hash);
    const token = app.jwt.sign({ id, email: body.email });
    return { token, user: { id, email: body.email } };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = store.findUserByEmail(body.email);
    if (!user) {
      reply.code(401);
      return { error: "Invalid credentials." };
    }
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) {
      reply.code(401);
      return { error: "Invalid credentials." };
    }
    const token = app.jwt.sign({ id: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  });

  app.post("/api/docs/ingest", async (request, reply) => {
    const body = ingestSchema.parse(request.body);
    const result = await rag.ingestText(body.title, body.text, body.source ?? null);
    return { ok: true, ...result };
  });

  app.post("/api/docs/upload", async (request, reply) => {
    const file = await (request as any).file();
    if (!file) {
      reply.code(400);
      return { error: "No file uploaded." };
    }
    const buffer = await file.toBuffer();
    const mime = file.mimetype;
    let text = "";
    try {
      if (mime === "application/pdf") {
        const parsed = await pdfParse(buffer);
        text = parsed.text;
      } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const parsed = await mammoth.extractRawText({ buffer });
        text = parsed.value;
      } else {
        text = buffer.toString("utf-8");
      }
    } catch (err) {
      reply.code(400);
      return { error: "Failed to parse document." };
    }
    const title = sanitizeInput(file.filename);
    const result = await rag.ingestText(title, text, file.filename);
    return { ok: true, ...result };
  });

  app.get("/api/docs", async () => ({ documents: store.listDocuments() }));

  app.delete("/api/docs/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    await rag.deleteDocument(id);
    return { ok: true };
  });

  app.get("/api/conversations", async () => ({ conversations: store.listConversations() }));

  app.get("/api/conversations/:id/messages", async (request) => {
    const id = Number((request.params as { id: string }).id);
    return { messages: store.listMessages(id) };
  });

  app.get("/api/conversations/:id/export", async (request) => {
    const id = Number((request.params as { id: string }).id);
    const messages = store.listMessages(id);
    return { conversationId: id, messages };
  });

  app.post("/api/chat", async (request, reply) => {
    const body = chatSchema.parse(request.body);
    const userId = await resolveUserId(request);

    const embedProvider = createEmbeddingProvider(body.embedProvider ?? config.DEFAULT_EMBED_PROVIDER);
    const llmProvider = createLlmProvider(body.llmProvider ?? config.DEFAULT_LLM_PROVIDER);

    const question = sanitizeInput(body.question);
    const priorMessages = body.conversationId ? store.listMessages(body.conversationId) : [];
    const history = priorMessages.slice(-6).map((m) => `${m.role}: ${m.content}`);
    const { contexts } = await rag.retrieveWith(question, body.k, embedProvider);
    const memories = await rag.getMemoryContext(question, embedProvider);
    const { prompt, citations } = rag.buildPrompt(question, contexts, memories, history);

    const conversationId =
      body.conversationId ?? store.createConversation(userId, question.slice(0, 48));
    store.insertMessage(conversationId, "user", question);

    const answer = await llmProvider.complete(prompt);
    store.insertMessage(conversationId, "assistant", answer);

    await rag.maybeStoreMemory(userId, `${question}\n${answer}`, llmProvider);

    return { answer, citations, contexts, conversationId, model: llmProvider.model };
  });

  app.post("/api/chat/stream", async (request, reply) => {
    const body = chatSchema.parse(request.body);
    const userId = await resolveUserId(request);
    const embedProvider = createEmbeddingProvider(body.embedProvider ?? config.DEFAULT_EMBED_PROVIDER);
    const llmProvider = createLlmProvider(body.llmProvider ?? config.DEFAULT_LLM_PROVIDER);

    const question = sanitizeInput(body.question);
    const priorMessages = body.conversationId ? store.listMessages(body.conversationId) : [];
    const history = priorMessages.slice(-6).map((m) => `${m.role}: ${m.content}`);
    const { contexts } = await rag.retrieveWith(question, body.k, embedProvider);
    const memories = await rag.getMemoryContext(question, embedProvider);
    const { prompt, citations } = rag.buildPrompt(question, contexts, memories, history);

    const conversationId =
      body.conversationId ?? store.createConversation(userId, question.slice(0, 48));
    store.insertMessage(conversationId, "user", question);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    let full = "";
    await llmProvider.stream(prompt, (token) => {
      full += token;
      reply.raw.write(`data: ${JSON.stringify({ token })}\n\n`);
    });
    store.insertMessage(conversationId, "assistant", full);

    await rag.maybeStoreMemory(userId, `${question}\n${full}`, llmProvider);

    reply.raw.write(
      `data: ${JSON.stringify({ done: true, citations, contexts, conversationId, model: llmProvider.model })}\n\n`
    );
    reply.raw.end();
  });

  app.get("/api/graph", async () => {
    const docs = store.listDocuments();
    const chunks = store.listChunks();
    const nodes = [
      ...docs.map((d) => ({ id: `doc-${d.id}`, label: d.title, type: "doc" })),
      ...chunks.map((c) => ({
        id: `chunk-${c.id}`,
        label: c.content.slice(0, 80),
        type: "chunk"
      }))
    ];
    const links = chunks.map((c) => ({ source: `doc-${c.docId}`, target: `chunk-${c.id}` }));
    return { nodes, links };
  });

  app.get("/api/tools", async () => ({
    tools: [
      {
        name: "searchDocs",
        description: "Run hybrid retrieval over stored documents."
      },
      {
        name: "stats",
        description: "Get document and conversation counts."
      }
    ]
  }));

  app.post("/api/tools/run", async (request, reply) => {
    const body = toolSchema.parse(request.body);
    if (body.name === "searchDocs") {
      const query = String(body.args?.query ?? "");
      const k = Number(body.args?.k ?? 4);
      const embedProvider = createEmbeddingProvider(config.DEFAULT_EMBED_PROVIDER);
      const result = await rag.retrieveWith(query, k, embedProvider);
      return { ok: true, result };
    }
    if (body.name === "stats") {
      return {
        ok: true,
        result: {
          documents: store.listDocuments().length,
          conversations: store.listConversations().length
        }
      };
    }
    reply.code(400);
    return { error: "Unknown tool." };
  });
};
