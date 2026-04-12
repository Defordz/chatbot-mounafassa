import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, Plus, Mic, MicOff, MessageSquare, Trash2 } from "lucide-react";
import ChatMessageComponent from "@/components/ChatMessage";
import type { ChatMessage } from "@/lib/api";
import { sendChatMessage } from "@/lib/api";
import councillogo from "@assets/image_1775927493944.png";

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "lexconc-conversations";
const ACTIVE_KEY = "lexconc-active-conv";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 45) return cleaned;
  return cleaned.slice(0, 42) + "...";
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return parsed.map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    }));
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch { /* quota exceeded — silently fail */ }
}

function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

type DateGroup = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older";

function getDateGroup(ts: number): DateGroup {
  const now = new Date();
  const d = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfWeek = startOfToday - now.getDay() * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  if (ts >= startOfToday) return "today";
  if (ts >= startOfYesterday) return "yesterday";
  if (ts >= startOfWeek) return "thisWeek";
  if (ts >= startOfMonth) return "thisMonth";
  return "older";
}

const GROUP_LABELS: Record<DateGroup, string> = {
  today: "Aujourd'hui",
  yesterday: "Hier",
  thisWeek: "Cette semaine",
  thisMonth: "Ce mois",
  older: "Plus ancien",
};

const GROUP_ORDER: DateGroup[] = ["today", "yesterday", "thisWeek", "thisMonth", "older"];

const DOCS = [
  { name: "Loi 104-12", desc: "Liberté des prix et concurrence" },
  { name: "Loi 20-13", desc: "Conseil de la concurrence" },
  { name: "Lignes directrices", desc: "Contrôle des concentrations" },
  { name: "Guidelines transaction", desc: "Procédure de transaction" },
];

const SUGGESTIONS = [
  { icon: "\u2696\uFE0F", label: "Concentrations", text: "Qu'est-ce qu'une opération de concentration économique ?" },
  { icon: "\uD83D\uDCCA", label: "Seuils", text: "Quels sont les seuils de notification obligatoire ?" },
  { icon: "\uD83D\uDD04", label: "Procédures", text: "Comment se déroule la procédure Phase I et Phase II ?" },
  { icon: "\uD83D\uDEE1\uFE0F", label: "Pratiques", text: "Quelles sont les pratiques anticoncurrentielles prohibées ?" },
];

const SVG_BOT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="3"/>
    <circle cx="9" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="14" r="1.5" fill="currentColor"/>
    <path d="M12 2v6"/><circle cx="12" cy="2" r="1" fill="currentColor"/>
  </svg>
);

let msgIdCounter = Date.now();
function newId() { return String(++msgIdCounter); }

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId());
  const [input, setInput] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );
  const messages = activeConv?.messages ?? [];
  const isLoading = pendingCount > 0;
  const questionCount = messages.filter((m) => m.role === "user").length;

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    saveActiveId(activeId);
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingCount]);

  const updateConversation = useCallback(
    (id: string, updater: (c: Conversation) => Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? updater(c) : c))
      );
    },
    []
  );

  const startNewConversation = useCallback(() => {
    setActiveId(null);
    setPendingCount(0);
    setInput("");
  }, []);

  const switchConversation = useCallback((id: string) => {
    setActiveId(id);
    setPendingCount(0);
    setInput("");
  }, []);

  const deleteConversation = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId]
  );

  const handleSend = useCallback(
    async (question?: string) => {
      const q = (question ?? input).trim();
      if (!q) return;

      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: q,
        timestamp: new Date(),
      };

      let convId = activeId;

      if (!convId) {
        const newConv: Conversation = {
          id: generateId(),
          title: generateTitle(q),
          messages: [userMsg],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        convId = newConv.id;
        setConversations((prev) => [newConv, ...prev]);
        setActiveId(convId);
      } else {
        updateConversation(convId, (c) => ({
          ...c,
          messages: [...c.messages, userMsg],
          updatedAt: Date.now(),
        }));
      }

      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setPendingCount((c) => c + 1);

      const currentConvId = convId;

      try {
        const currentConv = conversations.find((c) => c.id === currentConvId);
        const historyMsgs = currentConv ? currentConv.messages : [];
        const recentHistory = [...historyMsgs, userMsg]
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

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

        updateConversation(currentConvId, (c) => ({
          ...c,
          messages: [...c.messages, assistantMsg],
          updatedAt: Date.now(),
        }));
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: newId(),
          role: "assistant",
          content: err.message || "Erreur de connexion au service.",
          timestamp: new Date(),
          isError: true,
        };
        updateConversation(currentConvId, (c) => ({
          ...c,
          messages: [...c.messages, errorMsg],
          updatedAt: Date.now(),
        }));
      } finally {
        setPendingCount((c) => Math.max(0, c - 1));
      }
    },
    [input, activeId, conversations, updateConversation]
  );

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
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognition.onerror = () => { setListening(false); recognitionRef.current = null; };
    recognition.start();
  }, [listening]);

  const groupedConversations = useMemo(() => {
    const groups: Record<DateGroup, Conversation[]> = {
      today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [],
    };
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const conv of sorted) {
      groups[getDateGroup(conv.updatedAt)].push(conv);
    }
    return groups;
  }, [conversations]);

  return (
    <div className="app-container">
      {/* ─── SIDEBAR ─── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src={councillogo} alt="Conseil de la Concurrence" className="sidebar-logo-img" />
          <div className="sidebar-logo-text">
            <h1>Chatbot IA Monafassa</h1>
            <span>Assistant juridique IA</span>
          </div>
        </div>

        <div className="sidebar-divider" />

        <button className="btn-new-chat" onClick={startNewConversation}>
          <Plus size={18} />
          Nouvelle conversation
        </button>

        {/* Conversation History */}
        <div className="sidebar-history">
          {GROUP_ORDER.map((group) => {
            const convs = groupedConversations[group];
            if (convs.length === 0) return null;
            return (
              <div key={group}>
                <div className="sidebar-section-title">{GROUP_LABELS[group]}</div>
                {convs.map((conv) => (
                  <div
                    key={conv.id}
                    className={`conv-item ${conv.id === activeId ? "active" : ""}`}
                    onClick={() => switchConversation(conv.id)}
                  >
                    <MessageSquare size={14} className="conv-icon" />
                    <span className="conv-title">{conv.title}</span>
                    <button
                      className="conv-delete"
                      onClick={(e) => deleteConversation(conv.id, e)}
                      title="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Document list */}
        <div className="sidebar-docs">
          <div className="sidebar-section-title">Base documentaire</div>
          {DOCS.map((doc, i) => (
            <div key={doc.name} className="doc-item" style={{ animation: `slideInLeft 0.3s ease ${0.05 + i * 0.05}s both` }}>
              <div className="doc-dot" />
              <div>
                <div className="doc-name">{doc.name}</div>
                <div className="doc-desc">{doc.desc}</div>
              </div>
            </div>
          ))}
        </div>

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
        <header className="main-header">
          <div className="header-left">
            <div className="header-avatar">{SVG_BOT}</div>
            <div>
              <div className="header-title">
                {activeConv ? activeConv.title : "Chatbot IA Monafassa"}
              </div>
              <div className="header-subtitle">Assistant juridique · Droit de la concurrence</div>
            </div>
          </div>
          <div className="header-badge">
            {questionCount} question{questionCount !== 1 ? "s" : ""}
          </div>
        </header>

        <div className="chat-messages">
          <div className="chat-inner">
            {messages.length === 0 ? (
              <div className="welcome-screen">
                <img src={councillogo} alt="Conseil de la Concurrence" className="welcome-logo" />
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
              Les informations délivrées par le Chatbot IA Monafassa sont fournies à titre indicatif et ne peuvent être assimilées à une prise de position officielle du Conseil de la concurrence, ni engager sa responsabilité. Le Conseil de la concurrence se réserve le droit d'apprécier souverainement toute situation au regard des dispositions légales et réglementaires en vigueur.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
