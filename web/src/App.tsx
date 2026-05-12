import { Suspense, lazy } from "react";
import ChatPanel from "./components/ChatPanel";
import FloatingAssistant from "./components/FloatingAssistant";
import Sidebar from "./components/Sidebar";

const KnowledgeGraph = lazy(() => import("./components/KnowledgeGraph"));

export default function App() {
  return (
    <div className="min-h-screen bg-neo-bg text-white">
      <header className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-semibold tracking-[0.3em]">ritesAI</h1>
          <p className="text-xs text-white/50">Production-grade RAG platform</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <span className="px-3 py-1 rounded-full border border-white/10 bg-white/5">Hybrid Search</span>
          <span className="px-3 py-1 rounded-full border border-white/10 bg-white/5">Streaming</span>
          <span className="px-3 py-1 rounded-full border border-white/10 bg-white/5">Memory</span>
        </div>
      </header>

      <main className="px-6 py-6 grid gap-6 lg:grid-cols-[320px_1fr_1fr]">
        <Sidebar />
        <div className="flex flex-col gap-6">
          <Suspense fallback={<div className="glass-panel p-6 text-white/60">Loading graph…</div>}>
            <KnowledgeGraph />
          </Suspense>
          <div className="glass-panel p-6 text-sm text-white/60">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Semantic Pulse</div>
            <p className="mt-2">
              Visualize retrieval signals, memory hits, and active context. This panel can be
              extended with PCA/UMAP projections or time-series traces.
            </p>
          </div>
        </div>
        <ChatPanel />
      </main>

      <FloatingAssistant />
    </div>
  );
}
