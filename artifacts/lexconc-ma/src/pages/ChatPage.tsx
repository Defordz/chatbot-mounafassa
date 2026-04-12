import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Plus, Mic, MicOff } from "lucide-react";
import ChatMessageComponent from "@/components/ChatMessage";
import type { ChatMessage } from "@/lib/api";
import { sendChatMessage } from "@/lib/api";
import councillogo from "@assets/image_1775927493944.png";

const DOCS = [
  { name: "Loi 104-12", desc: "Liberté des prix et concurrence" },
  { name: "Loi 20-13", desc: "Conseil de la concurrence" },
  { name: "Lignes directrices", desc: "Contrôle des concentrations" },
  { name: "Guidelines transaction", desc: "Procédure de transaction" },
];

const SUGGESTIONS = [
  { icon: "⚖️", label: "Concentrations", text: "Qu'est-ce qu'une opération de concentration économique ?" },
  { icon: "📊", label: "Seuils", text: "Quels sont les seuils de notification obligatoire ?" },
  { icon: "🔄", label: "Procédures", text: "Comment se déroule la procédure Phase I et Phase II ?" },
  { icon: "🛡️", label: "Pratiques", text: "Quelles sont les pratiques anticoncurrentielles prohibées ?" },
];

const SVG_BOT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="3"/>
    <circle cx="9" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="14" r="1.5" fill="currentColor"/>
    <path d="M12 2v6"/><circle cx="12" cy="2" r="1" fill="currentColor"/>
  </svg>
);

let msgIdCounter = 0;
function newId() { return String(++msgIdCounter); }

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const isLoading = pendingCount > 0;
  const questionCount = messages.filter(m => m.role === "user").length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingCount]);

  const handleSend = useCallback(async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q) return;

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: q,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setPendingCount((c) => c + 1);

    try {
      const recentHistory = messages
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));
      recentHistory.push({ role: "user", content: q });

      const res = await sendChatMessage(q, recentHistory, null);

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
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: err.message || "Erreur de connexion au service.",
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setPendingCount((c) => Math.max(0, c - 1));
    }
  }, [input, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleMic = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      alert("La reconnaissance vocale n'est pas supportée par votre navigateur. Utilisez Chrome ou Edge.");
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
  }, [listening]);

  const clearConversation = () => {
    setMessages([]);
    setPendingCount(0);
  };

  return (
    <div className="app-container">
      {/* ─── SIDEBAR ─── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img
            src={councillogo}
            alt="Conseil de la Concurrence"
            className="sidebar-logo-img"
          />
          <div className="sidebar-logo-text">
            <h1>Chatbot IA Monafassa</h1>
            <span>Assistant juridique IA</span>
          </div>
        </div>

        <div className="sidebar-divider" />

        <button className="btn-new-chat" onClick={clearConversation}>
          <Plus size={18} />
          Nouvelle conversation
        </button>

        <div className="sidebar-section-title">Base documentaire</div>

        {DOCS.map((doc, i) => (
          <div
            key={doc.name}
            className="doc-item"
            style={{ animation: `slideInLeft 0.3s ease ${0.05 + i * 0.05}s both` }}
          >
            <div className="doc-dot" />
            <div>
              <div className="doc-name">{doc.name}</div>
              <div className="doc-desc">{doc.desc}</div>
            </div>
          </div>
        ))}

        <div className="sidebar-footer">
          <div className="sidebar-divider" />
          <div className="rag-status">
            <div className="rag-dot" />
            <span className="rag-label">Système RAG actif</span>
          </div>
          <div className="sidebar-credit">
            Conseil de la Concurrence<br />du Royaume du Maroc
          </div>
        </div>
      </aside>

      {/* ─── MAIN AREA ─── */}
      <main className="main-area">
        {/* Header */}
        <header className="main-header">
          <div className="header-left">
            <div className="header-avatar">
              {SVG_BOT}
            </div>
            <div>
              <div className="header-title">Chatbot IA Monafassa</div>
              <div className="header-subtitle">Assistant juridique · Droit de la concurrence</div>
            </div>
          </div>
          <div className="header-badge">
            {questionCount} question{questionCount !== 1 ? "s" : ""}
          </div>
        </header>

        {/* Messages */}
        <div className="chat-messages">
          <div className="chat-inner">
            {messages.length === 0 ? (
              <div className="welcome-screen">
                <img
                  src={councillogo}
                  alt="Conseil de la Concurrence"
                  className="welcome-logo"
                />
                <h2 className="welcome-title">Chatbot IA Monafassa</h2>
                <p className="welcome-desc">
                  Assistant juridique intelligent spécialisé en droit marocain de la
                  concurrence, basé sur les textes officiels du Conseil de la Concurrence.
                </p>
                <div className="suggestions-grid">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={s.label}
                      className="suggestion-card"
                      onClick={() => handleSend(s.text)}
                      style={{ animation: `fadeInUp 0.4s ease ${0.1 + i * 0.07}s both` }}
                    >
                      <span className="suggestion-icon">{s.icon}</span>
                      <div className="suggestion-label">{s.label}</div>
                      <div className="suggestion-text">{s.text}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessageComponent key={msg.id} message={msg} />
                ))}
                {isLoading && (
                  <div className="typing-row">
                    <div className="msg-avatar">{SVG_BOT}</div>
                    <div className="typing-bubble">
                      <div className="typing-label">Recherche dans la base documentaire...</div>
                      <div className="typing-dots">
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="input-area">
          <div className="input-inner">
            <div className="input-box">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={listening ? "Parlez maintenant..." : "Posez votre question en droit de la concurrence marocain..."}
                rows={1}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 130) + "px";
                }}
              />
              <button
                className={`btn-mic ${listening ? "listening" : ""}`}
                onClick={toggleMic}
                type="button"
                title={listening ? "Arrêter l'écoute" : "Dicter un message"}
              >
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button
                className={`btn-send ${input.trim() ? "active" : "inactive"}`}
                onClick={() => handleSend()}
                disabled={!input.trim()}
                type="button"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <div className="input-disclaimer">
              Les réponses sont fondées exclusivement sur les textes officiels indexés · Ne constituent pas un conseil juridique
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
