import { useEffect, useRef, useState } from "react";
import { streamChat } from "../hooks/useChatStream";
import { useDebounce } from "../hooks/useDebounce";
import type { ChatMessage } from "../types";

type Citation = { title: string; chunkId: number; score: number };

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const debouncedInput = useDebounce(input, 300);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [listening, setListening] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || streaming) return;
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setStreaming(true);
    setCitations([]);

    let answer = "";
    await streamChat(
      question,
      (token) => {
        answer += token;
        setMessages((prev) => {
          const clone = [...prev];
          if (clone.length && clone[clone.length - 1].role === "assistant") {
            clone[clone.length - 1] = { role: "assistant", content: answer };
          } else {
            clone.push({ role: "assistant", content: answer });
          }
          return clone;
        });
      },
      (payload) => {
        setStreaming(false);
        setCitations(payload.citations ?? []);
        if (payload.conversationId) setConversationId(payload.conversationId);
        if ("speechSynthesis" in window) {
          const utter = new SpeechSynthesisUtterance(answer);
          utter.rate = 1;
          window.speechSynthesis.speak(utter);
        }
      }
    );
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  return (
    <section className="glass-panel flex-1 flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Neural Chat</h2>
          <p className="text-xs text-white/50">Streaming, cited answers with memory.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className={`h-2 w-2 rounded-full ${streaming ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
          {streaming ? "Thinking..." : "Idle"}
        </div>
      </div>

      {conversationId && (
        <button
          className="self-start text-xs text-white/60 underline"
          onClick={async () => {
            const res = await fetch(
              `${import.meta.env.VITE_API_URL || "http://localhost:8080"}/api/conversations/${conversationId}/export`
            );
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `conversation-${conversationId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export conversation
        </button>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.length === 0 && (
          <div className="text-sm text-white/50">
            Ask about your uploaded documents to see citations and knowledge graph highlights.
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-neo-accent/20 border border-neo-accent/30"
                : "bg-white/5 border border-white/10"
            }`}
          >
            {msg.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {citations.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-white/60">
          {citations.map((c, i) => (
            <span key={`${c.chunkId}-${i}`} className="rounded-full border border-white/20 px-3 py-1">
              [{i + 1}] {c.title}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          className="glass-input min-h-[90px]"
          placeholder="Ask something... (Ctrl+Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) sendMessage();
          }}
        />
        <div className="flex items-center justify-between gap-3 text-xs text-white/50">
          <span>Approx tokens: {debouncedInput.trim().split(/\s+/).filter(Boolean).length}</span>
          <div className="flex items-center gap-3">
            <button className="glass-button flex-1" onClick={sendMessage} disabled={streaming}>
              {streaming ? "Streaming..." : "Send"}
            </button>
            <button
              className={`glass-button w-32 ${listening ? "border-emerald-400 text-emerald-300" : ""}`}
              onClick={() => {
                if (!recognitionRef.current) return;
                if (!listening) recognitionRef.current.start();
                setListening((prev) => !prev);
              }}
            >
              {listening ? "Listening..." : "Voice"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
