import { config } from "./config.js";

export type StreamHandler = (token: string) => void;

export interface EmbeddingProvider {
  name: string;
  model: string;
  embed(text: string): Promise<number[]>;
}

export interface LlmProvider {
  name: string;
  model: string;
  complete(prompt: string): Promise<string>;
  stream(prompt: string, onToken: StreamHandler): Promise<void>;
}

const readStream = async (res: Response, onLine: (line: string) => void) => {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) onLine(line.trim());
  }
};

class OllamaProvider implements EmbeddingProvider, LlmProvider {
  name = "ollama";
  model: string;
  private host: string;
  private port: number;

  constructor(model: string) {
    this.model = model;
    this.host = config.OLLAMA_HOST;
    this.port = config.OLLAMA_PORT;
  }

  async embed(text: string) {
    const res = await fetch(`http://${this.host}:${this.port}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.DEFAULT_EMBED_MODEL, prompt: text })
    });
    if (!res.ok) throw new Error("Ollama embeddings failed");
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }

  async complete(prompt: string) {
    const res = await fetch(`http://${this.host}:${this.port}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: false })
    });
    if (!res.ok) throw new Error("Ollama generate failed");
    const data = (await res.json()) as { response: string };
    return data.response;
  }

  async stream(prompt: string, onToken: StreamHandler) {
    const res = await fetch(`http://${this.host}:${this.port}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt, stream: true })
    });
    if (!res.ok) throw new Error("Ollama stream failed");
    await readStream(res, (line) => {
      if (!line) return;
      try {
        const data = JSON.parse(line) as { response?: string; done?: boolean };
        if (data.response) onToken(data.response);
      } catch {
        // ignore malformed lines
      }
    });
  }
}

class OpenAiProvider implements EmbeddingProvider, LlmProvider {
  name = "openai";
  model: string;
  private apiKey: string;

  constructor(model: string) {
    this.model = model;
    this.apiKey = config.OPENAI_API_KEY || "";
  }

  async embed(text: string) {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set");
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ model: config.OPENAI_EMBED_MODEL, input: text })
    });
    if (!res.ok) throw new Error("OpenAI embeddings failed");
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding ?? [];
  }

  async complete(prompt: string) {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error("OpenAI completion failed");
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? "";
  }

  async stream(prompt: string, onToken: StreamHandler) {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error("OpenAI stream failed");
    await readStream(res, (line) => {
      if (!line.startsWith("data:")) return;
      const payload = line.replace("data:", "").trim();
      if (payload === "[DONE]") return;
      try {
        const data = JSON.parse(payload) as { choices: { delta?: { content?: string } }[] };
        const token = data.choices[0]?.delta?.content;
        if (token) onToken(token);
      } catch {
        // ignore
      }
    });
  }
}

class AnthropicProvider implements LlmProvider {
  name = "anthropic";
  model: string;
  private apiKey: string;

  constructor(model: string) {
    this.model = model;
    this.apiKey = config.ANTHROPIC_API_KEY || "";
  }

  async complete(prompt: string) {
    if (!this.apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error("Anthropic completion failed");
    const data = (await res.json()) as { content: { text: string }[] };
    return data.content?.map((c) => c.text).join("") ?? "";
  }

  async stream(prompt: string, onToken: StreamHandler) {
    if (!this.apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 800,
        stream: true,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error("Anthropic stream failed");
    await readStream(res, (line) => {
      if (!line.startsWith("data:")) return;
      const payload = line.replace("data:", "").trim();
      try {
        const data = JSON.parse(payload) as { delta?: { text?: string } };
        if (data.delta?.text) onToken(data.delta.text);
      } catch {
        // ignore
      }
    });
  }
}

export const createEmbeddingProvider = (providerName: string) => {
  if (providerName === "openai") return new OpenAiProvider(config.OPENAI_EMBED_MODEL);
  return new OllamaProvider(config.DEFAULT_EMBED_MODEL);
};

export const createLlmProvider = (providerName: string) => {
  if (providerName === "openai") return new OpenAiProvider(config.OPENAI_LLM_MODEL);
  if (providerName === "anthropic") return new AnthropicProvider(config.ANTHROPIC_LLM_MODEL);
  return new OllamaProvider(config.DEFAULT_LLM_MODEL);
};
