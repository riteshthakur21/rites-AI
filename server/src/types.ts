export type Role = "user" | "assistant" | "system";

export type DocumentRow = {
  id: number;
  title: string;
  source: string | null;
  mimeType: string | null;
  bytes: number | null;
  createdAt: string;
};

export type ChunkRow = {
  id: number;
  docId: number;
  title: string;
  content: string;
  tokenCount: number;
  createdAt: string;
};

export type RetrievalChunk = {
  id: number;
  docId: number;
  title: string;
  content: string;
  score: number;
  source: "vector" | "keyword" | "hybrid";
};

export type Citation = {
  chunkId: number;
  docId: number;
  title: string;
  score: number;
};
