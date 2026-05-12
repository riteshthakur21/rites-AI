import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";

export const nowIso = () => new Date().toISOString();

export const hashText = (model: string, text: string) =>
  crypto.createHash("sha256").update(`${model}:${text}`).digest("hex");

export const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export const countTokens = (text: string) => tokenize(text).length;

export const truncateToTokens = (text: string, maxTokens: number) => {
  const tokens = tokenize(text);
  if (tokens.length <= maxTokens) return text;
  return tokens.slice(0, maxTokens).join(" ");
};

export const sanitizeInput = (text: string) =>
  sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).trim();
