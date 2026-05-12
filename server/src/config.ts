import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8080),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SQLITE_PATH: z.string().default("./data/app.db"),
  VECTOR_PATH: z.string().default("./data/vectors"),
  DEFAULT_EMBED_PROVIDER: z.string().default("ollama"),
  DEFAULT_LLM_PROVIDER: z.string().default("ollama"),
  DEFAULT_EMBED_MODEL: z.string().default("nomic-embed-text"),
  DEFAULT_LLM_MODEL: z.string().default("llama3.2"),
  MAX_CONTEXT_TOKENS: z.coerce.number().default(1600),
  CHUNK_SIZE: z.coerce.number().default(700),
  CHUNK_OVERLAP: z.coerce.number().default(120),
  OLLAMA_HOST: z.string().default("127.0.0.1"),
  OLLAMA_PORT: z.coerce.number().default(11434),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_LLM_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_LLM_MODEL: z.string().default("claude-3-5-sonnet-20240620")
});

export type AppConfig = z.infer<typeof envSchema>;
export const config: AppConfig = envSchema.parse(process.env);
