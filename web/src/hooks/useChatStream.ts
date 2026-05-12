const API = import.meta.env.VITE_API_URL || "http://localhost:8080";

export const streamChat = async (
  question: string,
  onToken: (token: string) => void,
  onDone: (payload: any) => void,
  k = 4
) => {
  const res = await fetch(`${API}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, k })
  });

  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.replace("data:", "").trim();
      if (!line) continue;
      const payload = JSON.parse(line);
      if (payload.token) onToken(payload.token);
      if (payload.done) onDone(payload);
    }
  }
};
