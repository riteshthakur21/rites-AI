import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { nowIso } from "./utils.js";
import type { ChunkRow, DocumentRow, Role } from "./types.js";
import * as lancedb from "@lancedb/lancedb";

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source TEXT,
  mime_type TEXT,
  bytes INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS embedding_cache (
  model TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  embedding TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (model, input_hash)
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export class SqliteStore {
  private db: Database.Database;

  constructor(filePath = config.SQLITE_PATH) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(filePath);
    this.db.exec(schemaSql);
  }

  createUser(email: string, passwordHash: string) {
    const stmt = this.db.prepare(
      "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)"
    );
    const info = stmt.run(email, passwordHash, nowIso());
    return info.lastInsertRowid as number;
  }

  findUserByEmail(email: string) {
    return this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email) as { id: number; email: string; password_hash: string } | undefined;
  }

  insertDocument(title: string, source: string | null, mimeType: string | null, bytes: number | null) {
    const stmt = this.db.prepare(
      "INSERT INTO documents (title, source, mime_type, bytes, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(title, source, mimeType, bytes, nowIso());
    return info.lastInsertRowid as number;
  }

  listDocuments(): DocumentRow[] {
    return this.db
      .prepare(
        "SELECT id, title, source, mime_type as mimeType, bytes, created_at as createdAt FROM documents ORDER BY id DESC"
      )
      .all() as DocumentRow[];
  }

  deleteDocument(docId: number) {
    this.db.prepare("DELETE FROM chunks WHERE doc_id = ?").run(docId);
    this.db.prepare("DELETE FROM documents WHERE id = ?").run(docId);
  }

  insertChunk(docId: number, title: string, content: string, tokenCount: number) {
    const stmt = this.db.prepare(
      "INSERT INTO chunks (doc_id, title, content, token_count, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(docId, title, content, tokenCount, nowIso());
    return info.lastInsertRowid as number;
  }

  listChunks(): ChunkRow[] {
    return this.db
      .prepare(
        "SELECT id, doc_id as docId, title, content, token_count as tokenCount, created_at as createdAt FROM chunks"
      )
      .all() as ChunkRow[];
  }

  listChunksByDoc(docId: number): ChunkRow[] {
    return this.db
      .prepare(
        "SELECT id, doc_id as docId, title, content, token_count as tokenCount, created_at as createdAt FROM chunks WHERE doc_id = ?"
      )
      .all(docId) as ChunkRow[];
  }

  cacheEmbedding(model: string, inputHash: string, embedding: number[]) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO embedding_cache (model, input_hash, embedding, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(model, inputHash, JSON.stringify(embedding), nowIso());
  }

  getCachedEmbedding(model: string, inputHash: string) {
    const row = this.db
      .prepare("SELECT embedding FROM embedding_cache WHERE model = ? AND input_hash = ?")
      .get(model, inputHash) as { embedding: string } | undefined;
    return row ? (JSON.parse(row.embedding) as number[]) : null;
  }

  createConversation(userId: number | null, title: string | null) {
    const stmt = this.db.prepare(
      "INSERT INTO conversations (user_id, title, created_at) VALUES (?, ?, ?)"
    );
    const info = stmt.run(userId, title, nowIso());
    return info.lastInsertRowid as number;
  }

  listConversations() {
    return this.db
      .prepare("SELECT id, user_id as userId, title, created_at as createdAt FROM conversations ORDER BY id DESC")
      .all() as { id: number; userId: number | null; title: string | null; createdAt: string }[];
  }

  insertMessage(conversationId: number, role: Role, content: string) {
    this.db
      .prepare(
        "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(conversationId, role, content, nowIso());
  }

  listMessages(conversationId: number) {
    return this.db
      .prepare(
        "SELECT id, conversation_id as conversationId, role, content, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY id ASC"
      )
      .all(conversationId) as {
      id: number;
      conversationId: number;
      role: Role;
      content: string;
      createdAt: string;
    }[];
  }

  insertMemory(userId: number | null, summary: string) {
    const stmt = this.db.prepare(
      "INSERT INTO memories (user_id, summary, created_at) VALUES (?, ?, ?)"
    );
    const info = stmt.run(userId, summary, nowIso());
    return info.lastInsertRowid as number;
  }

  listMemories(userId: number | null) {
    return this.db
      .prepare(
        "SELECT id, user_id as userId, summary, created_at as createdAt FROM memories WHERE user_id IS ? ORDER BY id DESC"
      )
      .all(userId) as { id: number; userId: number | null; summary: string; createdAt: string }[];
  }
}

export type VectorRecord = {
  id: string;
  doc_id: number | null;
  chunk_id: number | null;
  title: string;
  content: string;
  namespace: "chunk" | "memory";
  vector: number[];
};

export class VectorStore {
  private db: any;
  private chunkTable: any | null = null;
  private memoryTable: any | null = null;

  async init(basePath = config.VECTOR_PATH) {
    fs.mkdirSync(basePath, { recursive: true });
    this.db = await lancedb.connect(basePath);
  }

  private async ensureTable(name: "chunks" | "memories", rows: VectorRecord[]) {
    const existing = await this.db.tableNames();
    if (existing.includes(name)) {
      return this.db.openTable(name);
    }
    if (rows.length === 0) {
      // Minimal seed row to initialize schema if needed
      const seed = [{ id: "seed", doc_id: null, chunk_id: null, title: "seed", content: "", namespace: name === "chunks" ? "chunk" : "memory", vector: [0] }];
      const table = await this.db.createTable(name, seed, { mode: "overwrite" });
      await table.delete("id = 'seed'");
      return table;
    }
    return this.db.createTable(name, rows, { mode: "overwrite" });
  }

  async upsertChunks(rows: VectorRecord[]) {
    if (!this.chunkTable) this.chunkTable = await this.ensureTable("chunks", rows);
    if (rows.length === 0) return;
    await this.chunkTable.add(rows);
  }

  async upsertMemories(rows: VectorRecord[]) {
    if (!this.memoryTable) this.memoryTable = await this.ensureTable("memories", rows);
    if (rows.length === 0) return;
    await this.memoryTable.add(rows);
  }

  async queryChunks(vector: number[], limit: number) {
    if (!this.chunkTable) this.chunkTable = await this.ensureTable("chunks", []);
    return (await this.chunkTable.search(vector).limit(limit).toArray()) as VectorRecord[];
  }

  async queryMemories(vector: number[], limit: number) {
    if (!this.memoryTable) this.memoryTable = await this.ensureTable("memories", []);
    return (await this.memoryTable.search(vector).limit(limit).toArray()) as VectorRecord[];
  }

  async deleteChunksByDoc(docId: number) {
    if (!this.chunkTable) this.chunkTable = await this.ensureTable("chunks", []);
    await this.chunkTable.delete(`doc_id = ${docId}`);
  }
}
