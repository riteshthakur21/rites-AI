export type DocumentRow = {
  id: number;
  title: string;
  source: string | null;
  mimeType: string | null;
  bytes: number | null;
  createdAt: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GraphData = {
  nodes: { id: string; label: string; type: string }[];
  links: { source: string; target: string }[];
};

