import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function FloatingAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mb-3 w-64 rounded-2xl border border-white/10 bg-neo-card/90 p-4 backdrop-blur"
          >
            <div className="text-sm font-semibold">AI Companion</div>
            <p className="mt-2 text-xs text-white/60">
              I can summarize docs, suggest queries, or generate next actions.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="h-14 w-14 rounded-full bg-gradient-to-r from-neo-cyan to-neo-accent text-white shadow-lg shadow-neo-accent/40"
      >
        AI
      </button>
    </div>
  );
}
