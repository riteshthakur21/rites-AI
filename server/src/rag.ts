import { config } from "./config.js";
import type { Citation, RetrievalChunk } from "./types.js";
import { countTokens, hashText, sanitizeInput, tokenize, truncateToTokens } from "./utils.js";
import type { EmbeddingProvider, LlmProvider } from "./providers.js";
import type { SqliteStore, VectorRecord, VectorStore } from "./db.js";

type ChunkInput = { title: string; content: string; docId: number };

class Bm25Index {
  // Lightweight in-memory BM25 for hybrid search; rebuilt on boot.
  private docs = new Map<number, { tokens: string[]; length: number; title: string; content: string; docId: number }>();
  private df = new Map<string, number>();
  private avgLen = 0;

  add(docId: number, chunkId: number, title: string, content: string) {
    const tokens = tokenize(content);
    const unique = new Set(tokens);
    unique.forEach((t) => this.df.set(t, (this.df.get(t) ?? 0) + 1));
    this.docs.set(chunkId, { tokens, length: tokens.length, title, content, docId });
    this.recomputeAvg();
  }

  removeByDocId(docId: number) {
    for (const [chunkId, doc] of this.docs.entries()) {
      if (doc.docId !== docId) continue;
      const unique = new Set(doc.tokens);
      unique.forEach((t) => this.df.set(t, Math.max(0, (this.df.get(t) ?? 1) - 1)));
      this.docs.delete(chunkId);
    }
    this.recomputeAvg();
  }

  search(query: string, limit = 8) {
    const tokens = tokenize(query);
    const scores: { chunkId: number; score: number }[] = [];
    const N = this.docs.size || 1;
    const k1 = 1.2;
    const b = 0.75;

    for (const [chunkId, doc] of this.docs.entries()) {
      let score = 0;
      const freq = new Map<string, number>();
      doc.tokens.forEach((t) => freq.set(t, (freq.get(t) ?? 0) + 1));
      for (const term of tokens) {
        const tf = freq.get(term) ?? 0;
        if (tf === 0) continue;
        const df = this.df.get(term) ?? 0.5;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const denom = tf + k1 * (1 - b + (b * doc.length) / (this.avgLen || 1));
        score += idf * ((tf * (k1 + 1)) / denom);
      }
      if (score > 0) scores.push({ chunkId, score });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  getChunk(chunkId: number) {
    return this.docs.get(chunkId) ?? null;
  }

  private recomputeAvg() {
    const total = Array.from(this.docs.values()).reduce((sum, d) => sum + d.length, 0);
    this.avgLen = this.docs.size ? total / this.docs.size : 0;
  }
}

export class RagEngine {
  private bm25 = new Bm25Index();

  constructor(
    private store: SqliteStore,
    private vectors: VectorStore,
    private embedder: EmbeddingProvider,
    private llm: LlmProvider
  ) {}

  async bootstrap() {
    const chunks = this.store.listChunks();
    chunks.forEach((c) => this.bm25.add(c.docId, c.id, c.title, c.content));
  }

  async ingestText(title: string, text: string, source: string | null) {
    const cleanTitle = sanitizeInput(title);
    const cleanText = sanitizeInput(text);
    const docId = this.store.insertDocument(cleanTitle, source, "text/plain", cleanText.length);
    const chunks = chunkText(cleanText, config.CHUNK_SIZE, config.CHUNK_OVERLAP).map((content) => ({
      title: cleanTitle,
      content,
      docId
    }));
    const vectorRows: VectorRecord[] = [];
    for (const chunk of chunks) {
      const tokenCount = countTokens(chunk.content);
      const chunkId = this.store.insertChunk(docId, chunk.title, chunk.content, tokenCount);
      const embedding = await this.getEmbedding(chunk.content, this.embedder);
      vectorRows.push({
        id: `${docId}-${chunkId}`,
        doc_id: docId,
        chunk_id: chunkId,
        title: chunk.title,
        content: chunk.content,
        namespace: "chunk",
        vector: embedding
      });
      this.bm25.add(docId, chunkId, chunk.title, chunk.content);
    }
    await this.vectors.upsertChunks(vectorRows);
    return { docId, chunks: chunks.length };
  }

  async deleteDocument(docId: number) {
    this.store.deleteDocument(docId);
    this.bm25.removeByDocId(docId);
    await this.vectors.deleteChunksByDoc(docId);
  }

  async retrieve(question: string, k = 4) {
    return this.retrieveWith(question, k, this.embedder);
  }

  async retrieveWith(question: string, k = 4, embedder: EmbeddingProvider) {
    // Hybrid retrieval = vector search + keyword BM25, merged with reciprocal rank fusion.
    const embedding = await this.getEmbedding(question, embedder);
    const vectorHits = embedding.length ? await this.vectors.queryChunks(embedding, k * 4) : [];
    const keywordHits = this.bm25.search(question, k * 4);

    const combined = new Map<number, RetrievalChunk>();
    vectorHits.forEach((hit, idx) => {
      if (!hit.chunk_id) return;
      const score = 1 / (idx + 1);
      combined.set(hit.chunk_id, {
        id: hit.chunk_id,
        docId: hit.doc_id ?? 0,
        title: hit.title,
        content: hit.content,
        score,
        source: "vector"
      });
    });

    keywordHits.forEach((hit, idx) => {
      const existing = combined.get(hit.chunkId);
      const chunk = this.bm25.getChunk(hit.chunkId);
      if (!chunk) return;
      const score = 1 / (idx + 1);
      if (existing) {
        existing.score += score;
        existing.source = "hybrid";
      } else {
        combined.set(hit.chunkId, {
          id: hit.chunkId,
          docId: chunk.docId,
          title: chunk.title,
          content: chunk.content,
          score,
          source: "keyword"
        });
      }
    });

    const merged = Array.from(combined.values()).sort((a, b) => b.score - a.score);
    const diversified = mmrSelect(merged, k);
    const compressed = compressContexts(diversified, config.MAX_CONTEXT_TOKENS);
    return { contexts: compressed, embedding };
  }

  buildPrompt(question: string, contexts: RetrievalChunk[], memories: string[], history: string[] = []) {
    const citations: Citation[] = contexts.map((ctx, i) => ({
      chunkId: ctx.id,
      docId: ctx.docId,
      title: ctx.title,
      score: ctx.score
    }));

    const contextBlock = contexts
      .map((ctx, i) => `[${i + 1}] (${ctx.title}) ${ctx.content}`)
      .join("\n\n");

    const memoryBlock = memories.length
      ? `\n\nLong-term memory:\n${memories.map((m) => `- ${m}`).join("\n")}`
      : "";
    const historyBlock = history.length
      ? `\n\nRecent conversation:\n${history.join("\n")}`
      : "";

    const prompt = `
You are an AI assistant. Use ONLY the provided context to answer.
If the answer is not in the context, say you don't have enough information.
Always include citations like [1], [2] next to the statements they support.

Context:
${contextBlock}
${memoryBlock}
${historyBlock}

Question: ${question}
Answer:
    `.trim();

    return { prompt, citations };
  }

  async getEmbedding(text: string, embedder: EmbeddingProvider) {
    const key = hashText(embedder.model, text);
    const cached = this.store.getCachedEmbedding(embedder.model, key);
    if (cached) return cached;
    const embedding = await embedder.embed(text);
    this.store.cacheEmbedding(embedder.model, key, embedding);
    return embedding;
  }

  async getMemoryContext(question: string, embedder: EmbeddingProvider) {
    const embedding = await this.getEmbedding(question, embedder);
    const memories = await this.vectors.queryMemories(embedding, 4);
    return memories.map((m) => m.content).filter(Boolean);
  }

  async maybeStoreMemory(userId: number | null, transcript: string, llmOverride?: LlmProvider) {
    if (countTokens(transcript) < 300) return;
    const llm = llmOverride ?? this.llm;
    const summaryPrompt = `Summarize the following conversation in 4-6 bullet points:\n${transcript}`;
    const summary = await llm.complete(summaryPrompt);
    const memoryId = this.store.insertMemory(userId, summary);
    const embedding = await this.getEmbedding(summary, this.embedder);
    await this.vectors.upsertMemories([
      {
        id: `mem-${memoryId}`,
        doc_id: null,
        chunk_id: null,
        title: "Memory",
        content: summary,
        namespace: "memory",
        vector: embedding
      }
    ]);
  }
}

export const chunkText = (text: string, size: number, overlap: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= size) return [text];
  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += step) {
    const part = words.slice(i, i + size).join(" ");
    chunks.push(part);
    if (i + size >= words.length) break;
  }
  return chunks;
};

const mmrSelect = (chunks: RetrievalChunk[], k: number) => {
  if (chunks.length <= k) return chunks;
  const selected: RetrievalChunk[] = [];
  const remaining = [...chunks];
  while (selected.length < k && remaining.length) {
    const candidate = remaining.shift()!;
    const isDuplicate =
      selected.some((s) => s.docId === candidate.docId) ||
      selected.some((s) => overlapScore(s.content, candidate.content) > 0.6);
    if (!isDuplicate) selected.push(candidate);
  }
  if (selected.length < k) {
    const filler = chunks.filter((c) => !selected.includes(c)).slice(0, k - selected.length);
    selected.push(...filler);
  }
  return selected.length ? selected : chunks.slice(0, k);
};

const overlapScore = (a: string, b: string) => {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  let inter = 0;
  A.forEach((t) => {
    if (B.has(t)) inter += 1;
  });
  const denom = Math.max(A.size, B.size, 1);
  return inter / denom;
};

const compressContexts = (contexts: RetrievalChunk[], maxTokens: number) => {
  const total = contexts.reduce((sum, c) => sum + countTokens(c.content), 0);
  if (total <= maxTokens) return contexts;
  const per = Math.max(120, Math.floor(maxTokens / contexts.length));
  return contexts.map((ctx) => ({
    ...ctx,
    content: truncateToTokens(ctx.content, per)
  }));
};
