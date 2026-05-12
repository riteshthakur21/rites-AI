import type { DocumentRow, GraphData } from "../types";

const API = import.meta.env.VITE_API_URL || "http://localhost:8080";

const getToken = () => localStorage.getItem("ritesai_token");
const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const login = async (email: string, password: string) => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.token) localStorage.setItem("ritesai_token", data.token);
  return data;
};

export const register = async (email: string, password: string) => {
  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.token) localStorage.setItem("ritesai_token", data.token);
  return data;
};

export const fetchDocs = async (): Promise<DocumentRow[]> => {
  const res = await fetch(`${API}/api/docs`, { headers: authHeaders() });
  const data = await res.json();
  return data.documents ?? [];
};

export const uploadDoc = async (file: File) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/docs/upload`, { method: "POST", body: form, headers: authHeaders() });
  return res.json();
};

export const ingestText = async (title: string, text: string) => {
  const res = await fetch(`${API}/api/docs/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title, text })
  });
  return res.json();
};

export const fetchGraph = async (): Promise<GraphData> => {
  const res = await fetch(`${API}/api/graph`, { headers: authHeaders() });
  return res.json();
};
