import React, { useState, useRef, useEffect } from "react";
import { Send, Loader2, BookOpen, ChevronDown, RotateCcw, Filter } from "lucide-react";
import councillogo from "@assets/image_1775927493944.png";
import ChatMessageComponent from "@/components/ChatMessage";
import type { ChatMessage } from "@/lib/api";
import { sendChatMessage } from "@/lib/api";

const EXAMPLE_QUESTIONS = [
  "Qu'est-ce qu'une concentration au sens du droit marocain ?",
  "Quels sont les seuils de notification obligatoire ?",
  "Qu'est-ce que le contrôle conjoint ?",
  "Quelle est la durée de la phase 2 ?",
  "Le Conseil peut-il imposer des engagements ?",
  "Quelles sont les pratiques anticoncurrentielles interdites ?",
];

const SOURCE_FILTER_OPTIONS = [
  { value: "all", label: "Toutes les sources" },
  { value: "loi", label: "Lois uniquement" },
  { value: "ligne_directrice", label: "Lignes directrices" },
  { value: "communique", label: "Communiqués" },
  { value: "decision", label: "Décisions" },
];

let msgIdCounter = 0;
function newId() { return String(++msgIdCounter); }

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const getConversationHistory = () =>
    messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));

  const handleSend = async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: q,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = getConversationHistory();
      const res = await sendChatMessage(
        q,
        history,
        sourceFilter === "all" ? null : sourceFilter
      );

      const assistantMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: res.answer,
        sources: res.sources,
        confidence_score: res.confidence_score,
        retrieved_chunks: res.retrieved_chunks,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: err.message || "Une erreur s'est produite. Vérifiez que le service est démarré.",
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearConversation = () => {
    setMessages([]);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
          <img src={councillogo} alt="Conseil de la Concurrence" className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-bold text-foreground">Chatbot IA Monafassa</span>
            <span className="text-xs text-muted-foreground hidden sm:block">
              — Assistant juridique · Droit de la concurrence marocain
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setFilterOpen(!filterOpen)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                <span className="hidden sm:block">
                  {SOURCE_FILTER_OPTIONS.find((o) => o.value === sourceFilter)?.label}
                </span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-10 min-w-[180px] py-1">
                  {SOURCE_FILTER_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => { setSourceFilter(o.value); setFilterOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${sourceFilter === o.value ? "text-primary font-medium" : "text-foreground"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                title="Nouvelle conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <img src={councillogo} alt="Conseil de la Concurrence" className="h-16 w-auto object-contain mb-5" />
              <h2 className="text-xl font-semibold text-foreground mb-2">Chatbot IA Monafassa</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Assistant juridique interne spécialisé en droit de la concurrence marocain.
                <br />
                Toutes les réponses sont fondées exclusivement sur les textes officiels indexés.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="text-left text-xs text-muted-foreground border border-border rounded-lg px-3 py-2.5 hover:border-primary/40 hover:text-foreground hover:bg-muted/50 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessageComponent key={msg.id} message={msg} />
              ))}
              {loading && (
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-card border border-border rounded-2xl rounded-tl-md px-4 py-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-sm">Analyse des documents juridiques...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm p-3">
          {sourceFilter !== "all" && (
            <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="w-3 h-3" />
              Filtre actif :{" "}
              <span className="text-primary font-medium">
                {SOURCE_FILTER_OPTIONS.find((o) => o.value === sourceFilter)?.label}
              </span>
              <button
                onClick={() => setSourceFilter("all")}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                Désactiver
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question juridique en droit de la concurrence marocain..."
              rows={1}
              className="flex-1 resize-none bg-background border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all min-h-[42px] max-h-[120px]"
              style={{ height: "auto" }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground text-center">
            Les réponses sont fondées exclusivement sur les textes juridiques officiels indexés. Ne constituent pas un conseil juridique.
          </div>
        </div>
      </div>
    </div>
  );
}
