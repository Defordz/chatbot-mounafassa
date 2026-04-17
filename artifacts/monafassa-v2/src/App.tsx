import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Send, Loader2, Plus, Mic, MicOff, MessageSquare, Trash2,
  PanelLeftClose, PanelLeftOpen, Moon, Sun, Globe, Check,
  ThumbsUp, PencilLine, Clipboard, ChevronDown, ChevronUp,
} from "lucide-react";
import councillogo from "@assets/image_1775927493944.png";

const queryClient = new QueryClient();
const API_BASE = `/api`;

function getToken() { return localStorage.getItem("monafassa_admin_token"); }
function setToken(t: string) { localStorage.setItem("monafassa_admin_token", t); }
function clearToken() { localStorage.removeItem("monafassa_admin_token"); }

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as any) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
    throw new Error(err.error || "Erreur");
  }
  return res.json();
}

type Role = "user" | "assistant";
type Message = {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  isError?: boolean;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

type ThemeMode = "light" | "dark";
type View = "chat" | "admin";
type AdminTab = "documents" | "feedbacks" | "analytics" | "settings";
type DateGroup = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older";

const STORAGE_KEY = "monafassa_v2_history";
const ACTIVE_KEY = "monafassa_v2_active";
const THEME_KEY = "monafassa_v2_theme";

const GROUP_LABELS: Record<DateGroup, string> = {
  today: "Aujourd'hui",
  yesterday: "Hier",
  thisWeek: "Cette semaine",
  thisMonth: "Ce mois",
  older: "Plus ancien",
};
const GROUP_ORDER: DateGroup[] = ["today", "yesterday", "thisWeek", "thisMonth", "older"];

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function generateTitle(msg: string) {
  const c = msg.replace(/\s+/g, " ").trim();
  return c.length <= 45 ? c : c.slice(0, 42) + "...";
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Conversation[]).map(c => ({
      ...c,
      messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch { return []; }
}
function saveConversations(convs: Conversation[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convs)); } catch {}
}
function loadActiveId() { return localStorage.getItem(ACTIVE_KEY); }
function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}
function getSystemTheme(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function loadTheme(): ThemeMode {
  const s = localStorage.getItem(THEME_KEY);
  return s === "dark" || s === "light" ? s : getSystemTheme();
}
function getDateGroup(ts: number): DateGroup {
  const now = new Date();
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

let msgCounter = Date.now();
function newId() { return String(++msgCounter); }

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

const QUICK_ACTIONS = [
  "Qu'est-ce qu'une opération de concentration économique ?",
  "Quels sont les seuils de notification obligatoire ?",
  "Comment se déroule la procédure de notification ?",
];

const SUGGESTIONS = [
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>,
    label: "Concentrations",
    text: "Qu'est-ce qu'une opération de concentration économique ?"
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 9l9-6 9 6M5 20h14"/><path d="M5 12l-2 5h4l-2-5z"/><path d="M19 12l-2 5h4l-2-5z"/></svg>,
    label: "Seuils",
    text: "Quels sont les seuils de notification obligatoire ?"
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 17.5v3M17.5 14v1.5M17.5 17.5h-3"/></svg>,
    label: "Procédures",
    text: "Comment se déroule la procédure Phase I et Phase II ?"
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 4v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-4z"/><path d="M9 12l2 2 4-4"/></svg>,
    label: "Pratiques",
    text: "Quelles sont les pratiques anticoncurrentielles prohibées ?"
  },
];

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [adminToken, setAdminToken] = useState<string | null>(getToken());

  return (
    <QueryClientProvider client={queryClient}>
      {view === "chat" ? (
        <ChatPage onGoAdmin={() => setView("admin")} />
      ) : (
        <AdminView
          token={adminToken}
          onLogin={(t) => { setToken(t); setAdminToken(t); }}
          onLogout={() => { clearToken(); setAdminToken(null); setView("chat"); }}
          onBack={() => setView("chat")}
        />
      )}
    </QueryClientProvider>
  );
}

function ChatPage({ onGoAdmin }: { onGoAdmin: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId());
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarOpenRef = useRef(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState(
    "Assistant juridique intelligent spécialisé en droit marocain de la concurrence, basé sur les textes officiels du Conseil de la Concurrence."
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const activeConv = useMemo(() => conversations.find(c => c.id === activeId) ?? null, [conversations, activeId]);
  const messages = activeConv?.messages ?? [];
  const questionCount = messages.filter(m => m.role === "user").length;

  useEffect(() => { saveConversations(conversations); }, [conversations]);
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; }, [sidebarOpen]);
  useEffect(() => { saveActiveId(activeId); }, [activeId]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    apiFetch("/monafassa/settings").then((s: any) => {
      if (s.welcome_message) setWelcomeMsg(s.welcome_message);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingId]);

  useEffect(() => {
    const EDGE_ZONE = 24, OPEN_THRESHOLD = 55, CLOSE_THRESHOLD = 60;
    let startX = 0, startY = 0, tracking = false, mode: "open" | "close" | null = null, pointerDown = false;
    const begin = (x: number, y: number) => {
      startX = x; startY = y; tracking = true;
      if (!sidebarOpenRef.current && x <= EDGE_ZONE) mode = "open";
      else if (sidebarOpenRef.current) {
        const isMobile = window.innerWidth <= 768;
        mode = (isMobile || x <= 300) ? "close" : null;
      } else mode = null;
    };
    const move = (x: number, y: number, ev?: Event) => {
      if (!tracking || mode === null) return;
      const dx = x - startX, dy = y - startY;
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (mode === "open" && dx > OPEN_THRESHOLD) { setSidebarOpen(true); tracking = false; ev?.preventDefault?.(); }
      else if (mode === "close" && dx < -CLOSE_THRESHOLD) { setSidebarOpen(false); tracking = false; ev?.preventDefault?.(); }
    };
    const end = () => { tracking = false; mode = null; pointerDown = false; };
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length !== 1) return; begin(e.touches[0].clientX, e.touches[0].clientY); };
    const onTouchMove = (e: TouchEvent) => { if (e.touches.length !== 1) return; move(e.touches[0].clientX, e.touches[0].clientY, e); };
    const onMouseDown = (e: MouseEvent) => { if (e.button !== 0) return; pointerDown = true; begin(e.clientX, e.clientY); };
    const onMouseMove = (e: MouseEvent) => { if (!pointerDown) return; move(e.clientX, e.clientY, e); };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", end);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", end);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", end);
    };
  }, []);

  const updateConversation = useCallback((id: string, updater: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => c.id === id ? updater(c) : c));
  }, []);

  const startNewConversation = useCallback(() => { setActiveId(null); setInput(""); }, []);
  const switchConversation = useCallback((id: string) => { setActiveId(id); setInput(""); }, []);
  const deleteConversation = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Supprimer cette conversation ?")) return;
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeId === id) setActiveId(null);
  }, [activeId]);
  const clearAllConversations = useCallback(() => {
    if (!window.confirm("Supprimer tout l'historique ?")) return;
    setConversations([]); setActiveId(null);
  }, []);
  const toggleTheme = useCallback(() => setTheme(c => c === "light" ? "dark" : "light"), []);
  const handleExportConversation = useCallback(() => {
    if (!activeConv) return;
    const lines = activeConv.messages.map(m => `${m.role === "user" ? "[Vous]" : "[Monafassa]"} ${m.content}`);
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${activeConv.title || "conversation"}.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [activeConv]);

  const toggleMic = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      alert("La reconnaissance vocale n'est pas supportée par votre navigateur. Utilisez Chrome ou Edge.");
      return;
    }
    if (listening && recognitionRef.current) { recognitionRef.current.stop(); setListening(false); return; }
    const rec = new SpeechRecognitionAPI();
    rec.lang = "fr-FR"; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(t);
    };
    rec.onend = () => { setListening(false); recognitionRef.current = null; };
    rec.onerror = () => { setListening(false); recognitionRef.current = null; };
    rec.start();
  }, [listening]);

  const handleSend = useCallback(async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    const userMsg: Message = { id: newId(), role: "user", content: q, timestamp: new Date() };
    let convId = activeId;

    if (!convId) {
      const newConv: Conversation = {
        id: generateId(), title: generateTitle(q),
        messages: [userMsg], createdAt: Date.now(), updatedAt: Date.now(),
      };
      convId = newConv.id;
      setConversations(prev => [newConv, ...prev]);
      setActiveId(convId);
    } else {
      updateConversation(convId, c => ({ ...c, messages: [...c.messages, userMsg], updatedAt: Date.now() }));
    }

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    const currentConvId = convId;
    const assistantId = newId();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", timestamp: new Date() };
    updateConversation(currentConvId, c => ({ ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() }));
    setStreamingId(assistantId);

    const sessionMessages = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
    sessionMessages.push({ role: "user", content: q });

    try {
      const res = await fetch(`${API_BASE}/monafassa/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, session_messages: sessionMessages }),
      });

      if (!res.ok || !res.body) {
        updateConversation(currentConvId, c => ({
          ...c,
          messages: c.messages.map(m => m.id === assistantId ? { ...m, content: "Erreur serveur. Veuillez réessayer.", isError: true } : m),
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              updateConversation(currentConvId, c => ({
                ...c,
                messages: c.messages.map(m => m.id === assistantId ? { ...m, content: m.content + parsed.delta } : m),
                updatedAt: Date.now(),
              }));
            }
          } catch {}
        }
      }
    } catch {
      updateConversation(currentConvId, c => ({
        ...c,
        messages: c.messages.map(m => m.id === assistantId ? { ...m, content: "Désolé, une erreur est survenue. Veuillez réessayer.", isError: true } : m),
      }));
    } finally {
      setStreamingId(null);
      setLoading(false);
    }
  }, [input, loading, activeId, messages, updateConversation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const groupedConversations = useMemo(() => {
    const groups: Record<DateGroup, Conversation[]> = { today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [] };
    for (const conv of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
      groups[getDateGroup(conv.updatedAt)].push(conv);
    }
    return groups;
  }, [conversations]);

  return (
    <div className={`app-container ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      {/* ── SIDEBAR ── */}
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <div className="sidebar-logo">
          <img src={councillogo} alt="Conseil de la Concurrence" className="sidebar-logo-img" />
          <div className="sidebar-logo-text">
            <h1>Chatbot IA Monafassa</h1>
            <span>Assistant juridique IA</span>
          </div>
        </div>

        <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} title={sidebarOpen ? "Réduire" : "Afficher"}>
          <PanelLeftClose size={18} />
        </button>

        <div className="sidebar-divider" />

        <button className="btn-new-chat" onClick={startNewConversation}>
          <Plus size={18} />
          Nouvelle conversation
        </button>

        <div className="sidebar-history">
          {GROUP_ORDER.map(group => {
            const convs = groupedConversations[group];
            if (!convs.length) return null;
            return (
              <div key={group}>
                <div className="sidebar-section-title">{GROUP_LABELS[group]}</div>
                {convs.map(conv => (
                  <div key={conv.id} className={`conv-item ${conv.id === activeId ? "active" : ""}`} onClick={() => switchConversation(conv.id)}>
                    <MessageSquare size={14} className="conv-icon" />
                    <span className="conv-title">{conv.title}</span>
                    <button className="conv-delete" onClick={e => deleteConversation(conv.id, e)} title="Supprimer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {conversations.length === 0 && (
            <div className="sidebar-empty">Aucune conversation</div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-actions">
            <button className="sidebar-action" onClick={toggleTheme} title="Changer le thème">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="sidebar-action" onClick={clearAllConversations} title="Supprimer tout">
              <Trash2 size={16} />
            </button>
            <button className="sidebar-action" onClick={handleExportConversation} title="Exporter">
              <Globe size={16} />
            </button>
            <button className="sidebar-action" onClick={onGoAdmin} title="Administration">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
              </svg>
            </button>
          </div>
          <div className="sidebar-credit">Conseil de la Concurrence<br />du Royaume du Maroc</div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main-area">
        {messages.length > 0 && (
          <header className="main-header">
            <div className="header-left">
              {!sidebarOpen && (
                <button className="sidebar-expand" onClick={() => setSidebarOpen(true)} title="Afficher la barre latérale">
                  <PanelLeftOpen size={20} />
                </button>
              )}
              <button className="header-avatar header-home-btn" onClick={startNewConversation} title="Nouvelle conversation">
                <img src={councillogo} alt="logo" style={{ width: 32, height: 32, objectFit: "contain" }} />
              </button>
              <div>
                <div className="header-title">{activeConv?.title || "Chatbot IA Monafassa"}</div>
                <div className="header-subtitle">Assistant juridique · Droit de la concurrence</div>
              </div>
            </div>
            <div className="topbar-actions">
              <div className="status-pill"><span className="status-dot" />RAG actif</div>
              <div className="header-badge">{questionCount} question{questionCount !== 1 ? "s" : ""}</div>
            </div>
          </header>
        )}

        {messages.length === 0 && !sidebarOpen && (
          <div className="welcome-top-bar">
            <button className="sidebar-expand" onClick={() => setSidebarOpen(true)} title="Afficher la barre latérale">
              <PanelLeftOpen size={20} />
            </button>
          </div>
        )}

        <div className="chat-messages">
          <div className="chat-inner">
            {messages.length === 0 ? (
              <div className="welcome-screen">
                <img src={councillogo} alt="Conseil de la Concurrence" className="welcome-logo" />
                <h2 className="welcome-title">Chatbot IA Monafassa</h2>
                <p className="welcome-desc">{welcomeMsg}</p>

                <div className="quick-actions">
                  {QUICK_ACTIONS.map(action => (
                    <button key={action} className="quick-action" onClick={() => handleSend(action)} type="button">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                      {action}
                    </button>
                  ))}
                </div>

                <div className="suggestions-grid">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={s.label} className="suggestion-card" onClick={() => handleSend(s.text)} style={{ animation: `fadeInUp 0.4s ease ${0.1 + i * 0.07}s both` }}>
                      <span className="suggestion-icon">{s.icon}</span>
                      <div className="suggestion-label">{s.label}</div>
                      <div className="suggestion-text">{s.text}</div>
                    </button>
                  ))}
                </div>

                <div className="welcome-disclaimer">
                  Les informations délivrées par le Chatbot IA Monafassa sont fournies à titre indicatif et ne peuvent être assimilées à une prise de position officielle du Conseil de la concurrence. Les réponses sont basées exclusivement sur la base documentaire officielle.
                </div>
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <ChatMessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={msg.id === streamingId}
                    onCopy={async (text) => { try { await navigator.clipboard.writeText(text); } catch {} }}
                  />
                ))}
                {loading && !streamingId && (
                  <div className="typing-row">
                    <div className="msg-avatar">
                      <img src={councillogo} alt="Monafassa" className="bot-avatar-img" />
                    </div>
                    <div className="typing-bubble">
                      <div className="typing-label">Recherche dans la base documentaire...</div>
                      <div className="typing-dots">
                        <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
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
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={listening ? "Parlez maintenant..." : "Posez votre question en droit de la concurrence marocain..."}
                rows={1}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 130) + "px";
                }}
              />
              <button className={`btn-mic ${listening ? "listening" : ""}`} onClick={toggleMic} type="button" title={listening ? "Arrêter l'écoute" : "Dicter un message"}>
                {listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button className={`btn-send ${input.trim() ? "active" : "inactive"}`} onClick={() => handleSend()} disabled={!input.trim() || loading} type="button">
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
            <p className="input-disclaimer">Les réponses sont générées par IA à partir de la base documentaire officielle et ne remplacent pas un avis juridique professionnel.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function ChatMessageBubble({ message, isStreaming, onCopy }: {
  message: Message;
  isStreaming?: boolean;
  onCopy: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"useful" | "improve" | null>(null);
  const [showImprove, setShowImprove] = useState(false);
  const [improveText, setImproveText] = useState("");
  const isUser = message.role === "user";

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const timeStr = message.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  if (isUser) {
    return (
      <div className="msg-row user">
        <div className="msg-wrapper">
          <div className="msg-bubble user">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg-row assistant">
      <div className="msg-wrapper">
        <div className="msg-avatar">
          <img src={councillogo} alt="Monafassa" className="bot-avatar-img" />
        </div>
        <div className="msg-content-wrap">
          <div className={`msg-bubble assistant ${message.isError ? "error" : ""}`}>
            <MarkdownContent content={message.content} />
            {isStreaming && <span className="streaming-cursor">▌</span>}
          </div>

          {!isStreaming && message.content && (
            <div className="feedback-row">
              <button className="feedback-btn" onClick={() => { onCopy(message.content); setCopied(true); }} type="button">
                {copied ? <Check size={13} /> : <Clipboard size={13} />}
                Copier
              </button>
              <button className={`feedback-btn ${feedbackType === "useful" ? "active" : ""}`} onClick={() => setFeedbackType(v => v === "useful" ? null : "useful")} type="button">
                <ThumbsUp size={13} />
                Utile
              </button>
              <button className={`feedback-btn ${showImprove ? "active" : ""}`} onClick={() => setShowImprove(v => !v)} type="button">
                <PencilLine size={13} />
                Améliorer
              </button>
            </div>
          )}

          {showImprove && (
            <div className="feedback-improve">
              <textarea value={improveText} onChange={e => setImproveText(e.target.value)} placeholder="Expliquez ce qui pourrait être amélioré..." rows={3} />
              <button className="feedback-submit" type="button" onClick={() => setShowImprove(false)}>Enregistrer</button>
            </div>
          )}

          <div className="msg-timestamp">{timeStr}</div>
        </div>
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;
  const html = content
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^### (.*$)/gm, '<div class="resp-heading" style="font-size:13px">$1</div>')
    .replace(/^## (.*$)/gm, '<div class="resp-heading">$1</div>')
    .replace(/^# (.*$)/gm, '<div class="resp-heading" style="font-size:18px">$1</div>')
    .replace(/^\- (.*$)/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.*$)/gm, "<li>$2</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");
  return <div className="md-content" dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }} />;
}

function AdminView({ token, onLogin, onLogout, onBack }: {
  token: string | null;
  onLogin: (t: string) => void;
  onLogout: () => void;
  onBack: () => void;
}) {
  if (!token) return <AdminLogin onLogin={onLogin} onBack={onBack} />;
  return <AdminPanel onLogout={onLogout} onBack={onBack} />;
}

function AdminLogin({ onLogin, onBack }: { onLogin: (t: string) => void; onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await apiFetch("/monafassa/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      onLogin(res.token);
    } catch (err: any) {
      setError(err.message || "Mot de passe incorrect");
    } finally { setLoading(false); }
  };

  return (
    <div className="admin-login">
      <div className="login-card">
        <img src={councillogo} alt="Conseil" style={{ width: 80, height: 80, objectFit: "contain", margin: "0 auto 16px" }} />
        <h2>Administration Monafassa</h2>
        <form onSubmit={submit}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe administrateur" className="login-input" autoFocus />
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" disabled={loading || !password} className="login-btn">
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
        <button onClick={onBack} className="back-link">← Retour au chatbot</button>
      </div>
    </div>
  );
}

function AdminPanel({ onLogout, onBack }: { onLogout: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<AdminTab>("documents");
  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="header-left">
          <button onClick={onBack} className="back-btn">← Chatbot</button>
          <h1>Administration Monafassa</h1>
        </div>
        <button onClick={onLogout} className="logout-btn">Déconnexion</button>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav">
          {(["documents", "feedbacks", "analytics", "settings"] as AdminTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`nav-item ${tab === t ? "active" : ""}`}>
              {t === "documents" && "📄 Documents"}
              {t === "feedbacks" && "⭐ Feedbacks"}
              {t === "analytics" && "📊 Analytiques"}
              {t === "settings" && "⚙️ Paramètres"}
            </button>
          ))}
        </nav>
        <div className="admin-content">
          {tab === "documents" && <DocumentsTab />}
          {tab === "feedbacks" && <FeedbacksTab />}
          {tab === "analytics" && <AnalyticsTab />}
          {tab === "settings" && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}

function DocumentsTab() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch("/monafassa/admin/documents"); setDocs(res.documents || []); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const token = getToken();
      const res = await fetch(`${API_BASE}/monafassa/admin/documents`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setUploading(false); e.target.value = ""; }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce document ?")) return;
    try { await apiFetch(`/monafassa/admin/documents/${id}`, { method: "DELETE" }); setDocs(prev => prev.filter(d => d.id !== id)); }
    catch (err: any) { setError(err.message); }
  };
  return (
    <div className="tab-content">
      <div className="tab-header">
        <h2>Documents ({docs.length})</h2>
        <label className="upload-btn">{uploading ? "Upload..." : "+ Ajouter PDF"}<input type="file" accept=".pdf" onChange={handleUpload} disabled={uploading} hidden /></label>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {loading ? <div className="loading">Chargement...</div> : (
        <table className="data-table">
          <thead><tr><th>Nom</th><th>Taille</th><th>Statut</th><th>Action</th></tr></thead>
          <tbody>{docs.map(d => (
            <tr key={d.id}>
              <td className="doc-name">{d.name}</td>
              <td>{d.size ? `${Math.round(d.size / 1024)} KB` : "-"}</td>
              <td><span className={`status-badge ${d.status}`}>{d.status}</span></td>
              <td><button onClick={() => handleDelete(d.id)} className="delete-btn">🗑</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function FeedbacksTab() {
  const [data, setData] = useState<{ feedbacks: any[]; stats: any }>({ feedbacks: [], stats: null });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch("/monafassa/admin/feedbacks").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const { feedbacks, stats } = data;
  return (
    <div className="tab-content">
      <h2>Feedbacks utilisateurs</h2>
      {stats && (
        <div className="stats-row">
          <div className="stat-card"><span className="stat-val">{stats.total || 0}</span><span className="stat-label">Total</span></div>
          <div className="stat-card"><span className="stat-val">{Number(stats.avg_rating || 0).toFixed(1)}⭐</span><span className="stat-label">Note moyenne</span></div>
          <div className="stat-card"><span className="stat-val">{stats.positive || 0}</span><span className="stat-label">Positifs (≥4)</span></div>
        </div>
      )}
      {loading ? <div className="loading">Chargement...</div> : (
        <div className="feedback-list">
          {feedbacks.map((f: any) => (
            <div key={f.id} className="feedback-item">
              <div className="feedback-meta">
                <span className="stars-display">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>
                <span className="feedback-date">{new Date(f.created_at).toLocaleDateString("fr-FR")}</span>
              </div>
              <p className="feedback-q"><strong>Q:</strong> {f.message}</p>
              <p className="feedback-a"><strong>R:</strong> {f.answer.slice(0, 200)}...</p>
              {f.comment && <p className="feedback-comment-text">💬 {f.comment}</p>}
            </div>
          ))}
          {feedbacks.length === 0 && <p className="empty-state">Aucun feedback pour le moment.</p>}
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState<{ daily: any[]; totals: any }>({ daily: [], totals: null });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch("/monafassa/admin/analytics").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const maxQ = Math.max(...(data.daily.map(d => d.queries)), 1);
  return (
    <div className="tab-content">
      <h2>Analytiques</h2>
      {data.totals && (
        <div className="stats-row">
          <div className="stat-card"><span className="stat-val">{data.totals.total_queries || 0}</span><span className="stat-label">Requêtes totales</span></div>
          <div className="stat-card"><span className="stat-val">{data.totals.total_cache_hits || 0}</span><span className="stat-label">Cache hits</span></div>
          <div className="stat-card"><span className="stat-val">{data.totals.total_queries > 0 ? Math.round((data.totals.total_cache_hits / data.totals.total_queries) * 100) : 0}%</span><span className="stat-label">Taux cache</span></div>
        </div>
      )}
      {loading ? <div className="loading">Chargement...</div> : (
        <div className="chart-section">
          <h3>Requêtes par jour (30 derniers jours)</h3>
          <div className="bar-chart">
            {data.daily.slice(0, 14).reverse().map((d: any) => (
              <div key={d.date} className="bar-col">
                <div className="bar" style={{ height: `${(d.queries / maxQ) * 100}%` }} title={`${d.queries} requêtes`}></div>
                <span className="bar-label">{d.date.slice(5)}</span>
              </div>
            ))}
            {data.daily.length === 0 && <p className="empty-state">Aucune donnée disponible.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const [form, setForm] = useState({ system_prompt: "", welcome_message: "", max_tokens: 3000, temperature: 0.1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    apiFetch("/monafassa/admin/settings").then((s: any) => {
      setForm({ system_prompt: s.system_prompt || "", welcome_message: s.welcome_message || "", max_tokens: s.max_tokens || 3000, temperature: s.temperature ?? 0.1 });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { await apiFetch("/monafassa/admin/settings", { method: "PUT", body: JSON.stringify(form) }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch {} finally { setSaving(false); }
  };
  if (loading) return <div className="loading">Chargement...</div>;
  return (
    <div className="tab-content">
      <h2>Paramètres du chatbot</h2>
      <form onSubmit={save} className="settings-form">
        <div className="field">
          <label>Message d'accueil</label>
          <textarea value={form.welcome_message} onChange={e => setForm(f => ({ ...f, welcome_message: e.target.value }))} rows={3} placeholder="Message affiché aux nouveaux visiteurs..." />
        </div>
        <div className="field">
          <label>Prompt système (laissez vide pour utiliser le prompt par défaut sécurisé)</label>
          <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} rows={8} placeholder="Instructions personnalisées pour l'IA..." />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Max tokens: {form.max_tokens}</label>
            <input type="range" min="500" max="4000" step="100" value={form.max_tokens} onChange={e => setForm(f => ({ ...f, max_tokens: Number(e.target.value) }))} />
          </div>
          <div className="field">
            <label>Température: {form.temperature}</label>
            <input type="range" min="0" max="1" step="0.05" value={form.temperature} onChange={e => setForm(f => ({ ...f, temperature: Number(e.target.value) }))} />
          </div>
        </div>
        <button type="submit" disabled={saving} className="save-btn">
          {saving ? "Enregistrement..." : saved ? "✓ Enregistré" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
