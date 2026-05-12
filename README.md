# rites-AI — Production-Grade RAG Platform

A modern, scalable AI platform with a modular Node/TypeScript backend and a futuristic React UI. Built to be **beginner-friendly** yet **production-ready**, with robust RAG, hybrid search, memory, streaming responses, and a polished dashboard experience.

## What’s New (Why it matters)
1. **Proper RAG pipeline** — Chunking + hybrid search + MMR ranking + context compression for accurate, grounded answers.
2. **Streaming AI responses** — Improves UX and supports long generations.
3. **Semantic + conversational memory** — Enables long-term context and personalized interactions.
4. **Modern UI/UX** — Glassmorphism, animations, interactive knowledge graph, and real-time indicators.
5. **Production architecture** — Clean service layer, env validation, logging, error handling, rate limits.
6. **Deployment ready** — Docker, CI, env templates, and docs.

## Monorepo Layout
```
rites-AI/
├── server/                 # Node/TypeScript Fastify backend
├── web/                    # React/Vite + Tailwind frontend
├── legacy/                 # (Optional) legacy C++ demo app
├── docker-compose.yml
└── README.md
```

> The existing C++ demo (VectorDB + RAG) is preserved as **legacy** for reference.

---

## Quick Start

### Requirements
- **Node.js >= 18** (required by @lancedb/lancedb)

### 1. Backend (server/)
```
cd server
cp .env.example .env
npm install
npm run dev
```

### 2. Frontend (web/)
```
cd web
cp .env.example .env
npm install
npm run dev
```

---

## Backend Highlights (server/)
- **Fastify** for performance and clean plugins.
- **SQLite** for auth, docs, chat history, memory.
- **LanceDB** for vector search.
- **Hybrid search** (BM25 + vector) + **MMR** re-ranking.
- **Ollama + Cloud LLMs** (runtime model selection).
- **Embedding cache** to reduce cost/latency.
- **Streaming responses** via SSE.
- **Secure** (JWT, rate limits, sanitization, validation).

### Core API (selected)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| POST | `/api/docs/ingest` | Insert text document |
| POST | `/api/docs/upload` | Upload PDF/DOCX |
| POST | `/api/chat` | Ask (non-stream) |
| POST | `/api/chat/stream` | Ask (streaming SSE) |
| GET | `/api/graph` | Knowledge graph data |

---

## Frontend Highlights (web/)
- **Futuristic AI dashboard** (glassmorphism, dark theme).
- **Streaming chat UI** with typing animation and citations.
- **Floating assistant** + voice input/output.
- **Interactive knowledge graph** for semantic exploration.
- **Responsive layout** and modern loading states.

---

## Environment (.env)
See `server/.env.example` and `web/.env.example` for configuration.

---

## Deployment
- Dockerfiles for **server** and **web**
- `docker-compose.yml` for local production
- GitHub Actions CI for lint/test/build

---

## Legacy C++ Demo
The original single-file C++ VectorDB + static UI is kept for learning:
```
main.cpp
index.html
httplib.h
```

---

## Roadmap (SaaS & Monetization)
1. **SaaS tiers**: Free (local/Ollama), Pro (cloud models), Team (shared memory, collaboration).
2. **Usage-based billing**: token + embedding metering.
3. **Enterprise**: private deployments, SSO, audit logs.
4. **Marketplace**: plugins/tools with revenue sharing.

---

## Futuristic Feature Ideas
- **Personal knowledge AI**: lifelong memory, auto-organized by topic.
- **Team semantic workspace**: shared knowledge graph with permissions.
- **Realtime multimodal assistant**: webcam/screen context.
- **AI copilots per domain**: code, research, product, HR.

---

## License
MIT
