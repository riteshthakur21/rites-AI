import { useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { fetchGraph } from "../lib/api";
import type { GraphData } from "../types";

export default function KnowledgeGraph() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], links: [] });

  useEffect(() => {
    fetchGraph().then(setGraph).catch(() => {});
  }, []);

  return (
    <section className="glass-panel flex-1 min-h-[420px] p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm uppercase tracking-[0.3em] text-white/60">Knowledge Graph</h3>
          <p className="text-xs text-white/40">Explore document relationships dynamically.</p>
        </div>
      </div>
      <div className="h-[360px]">
        <ForceGraph2D
          graphData={graph}
          backgroundColor="#07070f"
          nodeAutoColorBy="type"
          nodeLabel={(node: any) => node.label}
          linkColor={() => "rgba(108,99,255,0.35)"}
        />
      </div>
    </section>
  );
}
