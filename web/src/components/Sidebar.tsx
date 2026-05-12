import { useEffect, useState } from "react";
import { fetchDocs, ingestText, login, register, uploadDoc } from "../lib/api";
import type { DocumentRow } from "../types";

export default function Sidebar() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const loadDocs = async () => {
    setLoading(true);
    setDocs(await fetchDocs());
    setLoading(false);
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleLogin = async () => {
    const res = await login(email, password);
    setAuthMessage(res.error ? res.error : "Logged in!");
  };

  const handleRegister = async () => {
    const res = await register(email, password);
    setAuthMessage(res.error ? res.error : "Account created!");
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    await uploadDoc(file);
    setBusy(false);
    loadDocs();
  };

  const handleIngest = async () => {
    if (!title || !text) return;
    setBusy(true);
    await ingestText(title, text);
    setTitle("");
    setText("");
    setBusy(false);
    loadDocs();
  };

  return (
    <aside className="glass-panel w-full max-w-[320px] p-5 flex flex-col gap-6">
      <div>
        <h2 className="text-xs uppercase tracking-[0.3em] text-white/60">Account</h2>
        <div className="mt-3 flex flex-col gap-2">
          <input
            className="glass-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="glass-input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="glass-button flex-1" onClick={handleLogin}>
              Login
            </button>
            <button className="glass-button flex-1" onClick={handleRegister}>
              Register
            </button>
          </div>
          {authMessage && <p className="text-xs text-white/60">{authMessage}</p>}
        </div>
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-[0.3em] text-white/60">Documents</h2>
        <div className="mt-3 space-y-2 max-h-52 overflow-y-auto">
          {loading && <p className="text-sm text-white/50">Loading documents…</p>}
          {!loading && docs.length === 0 && (
            <p className="text-sm text-white/50">No documents yet.</p>
          )}
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-sm font-semibold">{doc.title}</div>
              <div className="text-xs text-white/50">{doc.source ?? "Manual"}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs uppercase tracking-[0.3em] text-white/60">Upload</h2>
        <input
          type="file"
          className="mt-3 w-full text-sm text-white/70 file:mr-4 file:rounded-lg file:border-0 file:bg-neo-accent/80 file:px-3 file:py-2 file:text-xs file:text-white"
          onChange={(e) => handleUpload(e.target.files?.[0])}
          disabled={busy}
        />
        <p className="mt-2 text-xs text-white/40">PDF/DOCX/TXT supported.</p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-[0.3em] text-white/60">Quick Ingest</h2>
        <input
          className="glass-input"
          placeholder="Document title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
        <textarea
          className="glass-input min-h-[120px]"
          placeholder="Paste text to embed..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <button className="glass-button" onClick={handleIngest} disabled={busy}>
          {busy ? "Processing..." : "Embed & Insert"}
        </button>
      </div>
    </aside>
  );
}
