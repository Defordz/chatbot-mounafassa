import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import {
  Send, Loader2, Plus, Mic, MicOff, MessageSquare, Trash2,
  PanelLeftClose, PanelLeftOpen, Activity, Moon, Sun, X,
  ThumbsUp, PencilLine, Clipboard, Check, Settings, LogOut,
  FileText, ChevronDown, ChevronUp, Square, Download,
} from "lucide-react";

import councillogo from "@assets/image_1775927493944.png";
import chatbotLogo from "@assets/IMG_0521_1776050301072_transparent.png";
import sidebarBg from "@assets/Gemini_Generated_Image_3d8qzc3d8qzc3d8q_1775926443399.png";
import sidebarBgDark from "@assets/IMG_0653_1776476377835.png";

const API_BASE = "/api";

/* ─── Types ─────────────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  isError?: boolean;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface BotConfig {
  botName: string;
  greeting: string;
  primaryColor: string;
  secondaryColor: string;
}

interface AdminConfig extends BotConfig {
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
}

interface DocumentItem {
  id: number;
  name: string;
  originalFilename: string;
  size: number;
  mimeType: string;
  active: boolean;
  createdAt: string;
}

interface FeedbackItem {
  id: number;
  question: string;
  answer: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/* ─── Storage keys ───────────────────────────────────── */
const STORAGE_KEY = "conseil-history";
const ACTIVE_KEY = "conseil-active-conv";
const THEME_KEY = "conseil-theme";

/* ─── Helpers ────────────────────────────────────────── */
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs.slice(0, 50)));
  } catch {}
}

type ThemeMode = "light" | "dark";

function getSystemTheme(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function loadTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "dark" || saved === "light" ? saved : getSystemTheme();
}

type DateGroup = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older";

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

const GROUP_LABELS: Record<DateGroup, string> = {
  today: "Aujourd'hui",
  yesterday: "Hier",
  thisWeek: "Cette semaine",
  thisMonth: "Ce mois",
  older: "Plus ancien",
};

const GROUP_ORDER: DateGroup[] = ["today", "yesterday", "thisWeek", "thisMonth", "older"];

/* ─── Welcome content ────────────────────────────────── */
const QUICK_ACTIONS = [
  "Qu'est-ce qu'une opération de concentration économique ?",
  "Quels sont les seuils de notification obligatoire ?",
  "Comment se déroule la procédure Phase I et Phase II ?",
];

const SUGGESTIONS = [
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>,
    label: "Concentrations",
    text: "Qu'est-ce qu'une opération de concentration économique ?",
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 9l9-6 9 6M5 20h14"/><path d="M5 12l-2 5h4l-2-5z"/><path d="M19 12l-2 5h4l-2-5z"/></svg>,
    label: "Seuils",
    text: "Quels sont les seuils de notification obligatoire ?",
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 17.5v3M17.5 14v1.5M17.5 17.5h-3"/></svg>,
    label: "Procédures",
    text: "Comment se déroule la procédure Phase I et Phase II ?",
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 4v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-4z"/><path d="M9 12l2 2 4-4"/></svg>,
    label: "Pratiques",
    text: "Quelles sont les pratiques anticoncurrentielles prohibées ?",
  },
];

const BOT_AVATAR = <img src={chatbotLogo} alt="Chatbot Conseil" className="bot-avatar-img" />;

const IMPROVE_OPTIONS = [
  "Réponse incomplète",
  "Information incorrecte",
  "Peu claire ou confuse",
  "Hors sujet",
  "Source manquante",
  "Trop longue ou répétitive",
  "Autre",
];

/* ─── ChatMessage component ──────────────────────────── */
function ChatMessageComp({
  message,
  isStreaming,
  onCopy,
  onFeedback,
}: {
  message: Message;
  isStreaming?: boolean;
  onCopy?: (text: string) => void;
  onFeedback?: (msgId: string, rating: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<number | null>(null);
  const [showImprove, setShowImprove] = useState(false);
  const [improveChecked, setImproveChecked] = useState<string[]>([]);
  const [improveText, setImproveText] = useState("");
  const [improveSent, setImproveSent] = useState(false);

  const timeStr = message.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (message.role === "user") {
    return (
      <div className="msg-row user">
        <div className="msg-wrapper">
          <div className="msg-bubble user">{message.content}</div>
        </div>
      </div>
    );
  }

  if (message.isError) {
    return (
      <div className="msg-row assistant">
        <div className="msg-wrapper">
          <div className="msg-avatar">{BOT_AVATAR}</div>
          <div className="msg-content-wrap">
            <div className="msg-bubble error">{message.content}</div>
            <div className="msg-timestamp">{timeStr}</div>
          </div>
        </div>
      </div>
    );
  }

  const handleCopy = () => {
    onCopy?.(message.content);
    setCopied(true);
  };

  const handleFeedback = (rating: number) => {
    setFeedbackGiven(rating);
    onFeedback?.(message.id, rating);
  };

  function toggleOption(opt: string) {
    setImproveChecked(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
  }

  function submitImprove() {
    setImproveSent(true);
    setShowImprove(false);
    onFeedback?.(message.id, -1);
  }

  return (
    <div className="msg-row assistant">
      <div className="msg-wrapper">
        <div className="msg-avatar">{BOT_AVATAR}</div>
        <div className="msg-content-wrap">
          <div className="msg-bubble assistant">
            <ReactMarkdown
              components={{
                h2: ({ children }) => <div className="resp-heading">{children}</div>,
                h3: ({ children }) => <div className="resp-heading" style={{ fontSize: "13px" }}>{children}</div>,
                p: ({ children }) => <p>{children}</p>,
                strong: ({ children }) => <strong>{children}</strong>,
                ul: ({ children }) => <ul>{children}</ul>,
                ol: ({ children }) => <ol>{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                hr: () => <hr />,
                blockquote: ({ children }) => <blockquote>{children}</blockquote>,
              }}
            >
              {message.content || (isStreaming ? " " : "")}
            </ReactMarkdown>
            {isStreaming && <span className="streaming-cursor">▌</span>}
          </div>

          {!isStreaming && message.content && (
            <div className="feedback-row">
              <button className="feedback-btn" onClick={handleCopy} type="button">
                {copied ? <Check size={13} /> : <Clipboard size={13} />}
                Copier
              </button>
              <button
                className={`feedback-btn ${feedbackGiven === 1 ? "active" : ""}`}
                onClick={() => handleFeedback(1)}
                type="button"
              >
                <ThumbsUp size={13} />
                Utile
              </button>
              <button
                className={`feedback-btn ${showImprove || improveSent ? "active" : ""}`}
                onClick={() => setShowImprove(v => !v)}
                type="button"
              >
                <PencilLine size={13} />
                {improveSent ? "Envoyé ✓" : "Améliorer"}
              </button>
            </div>
          )}

          {showImprove && (
            <div className="feedback-improve">
              <p className="improve-title">Qu'est-ce qui pourrait être amélioré ?</p>
              <div className="improve-checklist">
                {IMPROVE_OPTIONS.map(opt => (
                  <label key={opt} className="improve-option">
                    <input
                      type="checkbox"
                      checked={improveChecked.includes(opt)}
                      onChange={() => toggleOption(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              <textarea
                value={improveText}
                onChange={(e) => setImproveText(e.target.value)}
                placeholder="Commentaire supplémentaire (optionnel)…"
                rows={2}
              />
              <button
                className="feedback-submit"
                type="button"
                onClick={submitImprove}
                disabled={improveChecked.length === 0 && !improveText.trim()}
              >
                Envoyer
              </button>
            </div>
          )}

          <div className="msg-timestamp">{timeStr}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── ChatPage ───────────────────────────────────────── */
function ChatPage({
  onAdmin,
  botConfig,
}: {
  onAdmin: () => void;
  botConfig: BotConfig;
}) {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY));
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarOpenRef = useRef(true);
  const [input, setInput] = useState("");
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );
  const messages = activeConv?.messages ?? [];
  const questionCount = messages.filter((m) => m.role === "user").length;

  /* Persist ─── */
  useEffect(() => { saveConversations(conversations); }, [conversations]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  }, [activeId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  /* Scroll ─── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMsgId]);

  /* Swipe gesture ─── */
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

  /* Conversation management ─── */
  function startNewConversation() {
    setActiveId(null);
    setInput("");
    textareaRef.current?.focus();
  }

  function loadConv(conv: Conversation) {
    setActiveId(conv.id);
    setInput("");
  }

  function deleteConv(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    if (activeId === id) setActiveId(null);
  }

  function clearAllConversations() {
    if (conversations.length === 0) return;
    if (!window.confirm("Supprimer toutes les conversations ?")) return;
    setConversations([]);
    setActiveId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  }

  /* Send message ─── */
  async function handleSend(text?: string) {
    const msgText = (text ?? input).trim();
    if (!msgText || isLoading) return;
    setInput("");

    const userMsg: Message = { id: genId(), role: "user", content: msgText, timestamp: new Date() };
    const assistantMsgId = genId();
    const assistantMsg: Message = { id: assistantMsgId, role: "assistant", content: "", streaming: true, timestamp: new Date() };

    let convId = activeId;
    let newConv: Conversation | null = null;

    if (!convId) {
      convId = genId();
      const title = msgText.length > 45 ? msgText.slice(0, 42) + "..." : msgText;
      newConv = { id: convId, title, messages: [userMsg, assistantMsg], createdAt: Date.now(), updatedAt: Date.now() };
      setConversations(prev => [newConv!, ...prev]);
      setActiveId(convId);
    } else {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, userMsg, assistantMsg], updatedAt: Date.now() } : c));
    }

    setStreamingMsgId(assistantMsgId);
    setIsLoading(true);

    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch(`${API_BASE}/conseil/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msgText, history }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Erreur réseau");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const evt = JSON.parse(json);
            if (evt.text) {
              fullText += evt.text;
              setConversations(prev => prev.map(c => c.id === convId ? {
                ...c,
                messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, content: fullText } : m),
              } : c));
            }
            if (evt.error) throw new Error(evt.error);
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }

      setConversations(prev => prev.map(c => c.id === convId ? {
        ...c,
        messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, content: fullText, streaming: false } : m),
        updatedAt: Date.now(),
      } : c));

    } catch (err: any) {
      if (err?.name === "AbortError") return;
      const errMsg = err instanceof Error ? err.message : "Une erreur est survenue";
      setConversations(prev => prev.map(c => c.id === convId ? {
        ...c,
        messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, content: `Erreur : ${errMsg}`, streaming: false, isError: true } : m),
      } : c));
    } finally {
      setStreamingMsgId(null);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  /* Voice ─── */
  function toggleMic() {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { alert("Votre navigateur ne supporte pas la reconnaissance vocale."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SpeechRecognitionAPI();
    rec.lang = "fr-FR";
    rec.continuous = false;
    rec.interimResults = false;
    recognitionRef.current = rec;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  /* Copy ─── */
  async function handleCopyMessage(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
  }

  /* Feedback ─── */
  async function handleFeedback(msgId: string, rating: number) {
    const conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    const msgIdx = conv.messages.findIndex(m => m.id === msgId);
    if (msgIdx <= 0) return;
    const question = conv.messages.slice(0, msgIdx).reverse().find(m => m.role === "user")?.content || "";
    const answer = conv.messages[msgIdx].content;
    await fetch(`${API_BASE}/conseil/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, rating }),
    }).catch(() => {});
  }

  /* Group conversations ─── */
  const groupedConvs = useMemo(() => {
    const groups = new Map<DateGroup, Conversation[]>();
    GROUP_ORDER.forEach(g => groups.set(g, []));
    [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).forEach(c => {
      const g = getDateGroup(c.updatedAt);
      groups.get(g)!.push(c);
    });
    return groups;
  }, [conversations]);

  /* ── Render ── */
  return (
    <div className="app-container">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}
        style={{
          backgroundImage: `url(${theme === "dark" ? sidebarBgDark : sidebarBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Logo */}
        <div className="sidebar-logo">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(false)}
            title="Réduire la barre latérale"
          >
            <PanelLeftClose size={18} />
          </button>
          <img src={councillogo} alt="Conseil de la Concurrence" className="sidebar-logo-img" />
          <div className="sidebar-logo-text">
            <h1>{botConfig.botName || "Conseil IA"}</h1>
            <span>CC V 3.0</span>
          </div>
        </div>

        <div className="sidebar-divider" />

        {/* New chat */}
        <button className="btn-new-chat" onClick={startNewConversation}>
          <Plus size={15} />
          Nouvelle conversation
        </button>

        {/* Conversation history */}
        <div className="sidebar-history">
          {conversations.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px", textAlign: "center", padding: "24px 8px" }}>
              Aucune conversation
            </div>
          ) : (
            GROUP_ORDER.map(g => {
              const convs = groupedConvs.get(g) ?? [];
              if (!convs.length) return null;
              return (
                <React.Fragment key={g}>
                  <div className="sidebar-section-title">{GROUP_LABELS[g]}</div>
                  {convs.map(c => (
                    <div
                      key={c.id}
                      className={`conv-item ${activeId === c.id ? "active" : ""}`}
                      onClick={() => loadConv(c)}
                    >
                      <MessageSquare size={13} className="conv-icon" />
                      <span className="conv-title">{c.title}</span>
                      <button
                        className="conv-delete"
                        onClick={(e) => deleteConv(c.id, e)}
                        title="Supprimer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-divider" />
          <div className="sidebar-actions">
            <button
              className="sidebar-action"
              onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Mode clair" : "Mode sombre"}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="sidebar-action sidebar-action-danger"
              onClick={clearAllConversations}
              title="Supprimer toutes les conversations"
              disabled={conversations.length === 0}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main-area" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Header (shown only when in chat) */}
        {messages.length > 0 && (
          <header className="main-header">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {!sidebarOpen && (
                <button
                  className="sidebar-expand"
                  onClick={() => setSidebarOpen(true)}
                  title="Afficher la barre latérale"
                >
                  <PanelLeftOpen size={20} />
                </button>
              )}
              <button className="header-avatar header-home-btn" onClick={startNewConversation} title="Retour à l'accueil" aria-label="Retour à l'accueil">
                {BOT_AVATAR}
              </button>
              <div>
                <div className="header-title">
                  {activeConv ? activeConv.title : (botConfig.botName || "Conseil IA")}
                </div>
                <div className="header-subtitle">Chatbot CC V 3.0 · Conseil de la Concurrence</div>
              </div>
            </div>
            <div className="topbar-actions">
              <div className="header-badge">
                {questionCount} question{questionCount !== 1 ? "s" : ""}
              </div>
              <button
                className="header-admin-btn"
                onClick={onAdmin}
                title="Administration"
                aria-label="Administration"
              >
                <Settings size={16} />
              </button>
            </div>
          </header>
        )}

        {messages.length === 0 && (
          <div className="welcome-top-bar">
            {!sidebarOpen && (
              <button
                className="sidebar-expand"
                onClick={() => setSidebarOpen(true)}
                title="Afficher la barre latérale"
              >
                <PanelLeftOpen size={20} />
              </button>
            )}
            <button
              className="header-admin-btn"
              onClick={onAdmin}
              title="Administration"
              aria-label="Administration"
              style={{ marginLeft: "auto" }}
            >
              <Settings size={16} />
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          <div className="chat-inner">
            {messages.length === 0 ? (
              <div className="welcome-screen">
                <img src={councillogo} alt="Conseil de la Concurrence" className="welcome-logo" />
                <div className="welcome-chatbot-animated">
                  <img src={chatbotLogo} alt="Chatbot Conseil" className="welcome-chatbot-logo" />
                </div>
                <h2 className="welcome-title">{botConfig.botName || "Chatbot IA Conseil"}</h2>
                <p className="welcome-desc">
                  Assistant juridique intelligent spécialisé en droit marocain de la concurrence, basé sur les textes officiels du Conseil de la Concurrence.
                </p>
                <div className="quick-actions">
                  {QUICK_ACTIONS.map((action) => (
                    <button key={action} className="quick-action" onClick={() => handleSend(action)} type="button">
                      <Activity size={14} />
                      {action}
                    </button>
                  ))}
                </div>
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
                <div className="welcome-disclaimer">
                  Les informations délivrées par ce Chatbot IA sont fournies à titre indicatif et ne peuvent être assimilées à une prise de position officielle du Conseil de la concurrence, ni engager sa responsabilité. Le Conseil de la concurrence se réserve le droit d'apprécier souverainement toute situation au regard des dispositions légales et réglementaires en vigueur.
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessageComp
                    key={msg.id}
                    message={msg}
                    isStreaming={msg.id === streamingMsgId}
                    onCopy={handleCopyMessage}
                    onFeedback={handleFeedback}
                  />
                ))}
                {isLoading && !streamingMsgId && (
                  <div className="typing-row">
                    <div className="msg-avatar">{BOT_AVATAR}</div>
                    <div className="typing-bubble">
                      <div className="typing-label">Génération de la réponse…</div>
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

        {/* Input area */}
        <div className="input-area">
          <div className="input-inner">
            <div className="input-box">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={listening ? "Parlez maintenant…" : "Posez votre question au Conseil de la Concurrence…"}
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
              {streamingMsgId ? (
                <button
                  className="btn-send active"
                  onClick={() => {
                    abortControllerRef.current?.abort();
                    setStreamingMsgId(null);
                    setIsLoading(false);
                  }}
                  type="button"
                  title="Arrêter la génération"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  className={`btn-send ${input.trim() ? "active" : "inactive"}`}
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  type="button"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─── AdminPage ──────────────────────────────────────── */
function AdminPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"documents" | "feedback" | "config">("documents");
  const [token, setToken] = useState(() => localStorage.getItem("conseil-admin-token") || "");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState("");

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/conseil/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPassword }),
      });
      if (!res.ok) { setLoginError("Mot de passe incorrect"); return; }
      const { token: t } = await res.json();
      setToken(t);
      setSessionExpiredMsg("");
      localStorage.setItem("conseil-admin-token", t);
    } catch { setLoginError("Erreur de connexion"); }
    finally { setLoginLoading(false); }
  }

  function handleSessionExpired() {
    localStorage.removeItem("conseil-admin-token");
    setToken("");
    setSessionExpiredMsg("Votre session a expiré. Veuillez vous reconnecter.");
  }

  if (!token) {
    return (
      <div className="admin-page">
        <div className="admin-login-wrap">
          <button onClick={onBack} className="admin-back-btn">
            ← Retour au chat
          </button>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div className="admin-icon-wrap">
              <Settings size={24} />
            </div>
            <h1 className="admin-title">Administration</h1>
            <p className="admin-subtitle">Accès restreint</p>
          </div>
          {sessionExpiredMsg && (
            <p className="admin-error" style={{ textAlign: "center", marginBottom: "16px" }}>
              {sessionExpiredMsg}
            </p>
          )}
          <form onSubmit={login} className="admin-form">
            <div className="admin-field">
              <label>Mot de passe</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Mot de passe admin"
                autoFocus
              />
              {loginError && <p className="admin-error">{loginError}</p>}
            </div>
            <button type="submit" disabled={loginLoading} className="admin-submit-btn">
              {loginLoading ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={onBack} className="admin-back-btn" style={{ marginBottom: 0 }}>←</button>
          <img src={councillogo} alt="Logo" style={{ height: "36px", objectFit: "contain", background: "white", borderRadius: "6px", padding: "4px 8px" }} />
          <span style={{ fontWeight: 700, fontSize: "18px" }}>Administration</span>
        </div>
        <button onClick={() => { localStorage.removeItem("conseil-admin-token"); setToken(""); }} className="admin-logout-btn">
          <LogOut size={14} />
          Déconnexion
        </button>
      </header>

      <div className="admin-body">
        <div className="admin-tabs">
          {(["documents", "feedback", "config"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`admin-tab ${tab === t ? "active" : ""}`}
            >
              {t === "documents" ? "📄 Documents" : t === "feedback" ? "💬 Feedback" : "⚙️ Configuration"}
            </button>
          ))}
        </div>

        {tab === "documents" && <DocumentsTab token={token} onSessionExpired={handleSessionExpired} />}
        {tab === "feedback" && <FeedbackTab token={token} onSessionExpired={handleSessionExpired} />}
        {tab === "config" && <ConfigTab token={token} onSessionExpired={handleSessionExpired} />}
      </div>
    </div>
  );
}

/* ─── Documents tab ──────────────────────────────────── */
function DocumentsTab({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadDocs() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/conseil/admin/documents`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { onSessionExpired(); return; }
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : []);
    } catch { setError("Erreur de chargement"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadDocs(); }, []);

  async function uploadDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) { setError("Choisissez un fichier"); return; }
    setUploading(true); setError(""); setSuccess("");
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      if (uploadName.trim()) form.append("name", uploadName.trim());
      const res = await fetch(`${API_BASE}/conseil/admin/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSuccess(`Document ajouté (${data.chunksProcessed} segments indexés)`);
      setSelectedFile(null); setUploadName("");
      if (fileRef.current) fileRef.current.value = "";
      loadDocs();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    finally { setUploading(false); }
  }

  async function toggleDoc(id: number, active: boolean) {
    await fetch(`${API_BASE}/conseil/admin/documents/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    loadDocs();
  }

  async function deleteDoc(id: number) {
    if (!confirm("Supprimer ce document et tous ses segments ?")) return;
    await fetch(`${API_BASE}/conseil/admin/documents/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    loadDocs();
  }

  return (
    <div className="admin-section">
      <div className="admin-card">
        <h2 className="admin-card-title">Ajouter un document</h2>
        <form onSubmit={uploadDoc} className="admin-form">
          <div className="admin-field">
            <label>Nom du document (optionnel)</label>
            <input type="text" value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="Ex: Règlement intérieur 2024" />
          </div>
          <div
            className="upload-zone"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
            onDragLeave={e => e.currentTarget.classList.remove("dragover")}
            onDrop={e => {
              e.preventDefault(); e.currentTarget.classList.remove("dragover");
              const f = e.dataTransfer.files[0];
              if (f) setSelectedFile(f);
            }}
          >
            <input ref={fileRef} type="file" accept=".pdf,.txt,.text" style={{ display: "none" }} onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
            {selectedFile ? (
              <div>
                <p style={{ fontWeight: 600, fontSize: "14px" }}>{selectedFile.name}</p>
                <p style={{ fontSize: "12px", color: "var(--text-400)" }}>{formatBytes(selectedFile.size)}</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "24px", marginBottom: "4px" }}>📄</p>
                <p style={{ fontSize: "14px", fontWeight: 500 }}>Cliquez ou glissez un fichier ici</p>
                <p style={{ fontSize: "12px", color: "var(--text-400)", marginTop: "4px" }}>PDF, TXT (max 20 MB)</p>
              </div>
            )}
          </div>
          {error && <p className="admin-error">{error}</p>}
          {success && <p className="admin-success">{success}</p>}
          <button type="submit" disabled={uploading || !selectedFile} className="admin-submit-btn">
            {uploading ? "Traitement en cours…" : "Indexer le document"}
          </button>
        </form>
      </div>

      <div className="admin-card">
        <h2 className="admin-card-title">Documents ({docs.length})</h2>
        {loading ? (
          <div className="admin-loading">Chargement…</div>
        ) : docs.length === 0 ? (
          <div className="admin-empty">Aucun document indexé</div>
        ) : (
          <div className="doc-list">
            {docs.map(doc => (
              <div key={doc.id} className="doc-row">
                <FileText size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</p>
                  <p style={{ fontSize: "12px", color: "var(--text-400)" }}>
                    {doc.originalFilename} · {formatBytes(doc.size)} · {new Date(doc.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  <span className={`doc-badge ${doc.active ? "active" : "inactive"}`}>{doc.active ? "Actif" : "Inactif"}</span>
                  <button className="doc-action-btn" onClick={() => toggleDoc(doc.id, !doc.active)}>
                    {doc.active ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    className="doc-action-btn"
                    title="Télécharger le contenu"
                    onClick={async () => {
                      const res = await fetch(`${API_BASE}/conseil/admin/documents/${doc.id}/download`, {
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      if (!res.ok) return;
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = doc.originalFilename.replace(/\.[^.]+$/, "") + ".txt";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download size={13} />
                  </button>
                  <button className="doc-action-btn danger" onClick={() => deleteDoc(doc.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Feedback tab ───────────────────────────────────── */
function FeedbackTab({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/conseil/admin/feedbacks`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) { onSessionExpired(); return null; }
        return r.json();
      })
      .then(d => { if (d) setFeedbacks(Array.isArray(d) ? d : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const positive = feedbacks.filter(f => f.rating > 0).length;
  const negative = feedbacks.filter(f => f.rating <= 0).length;

  return (
    <div className="admin-section">
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{feedbacks.length}</div>
          <div className="admin-stat-label">Total</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value" style={{ color: "var(--green-600)" }}>{positive}</div>
          <div className="admin-stat-label">👍 Utiles</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value" style={{ color: "#e74c3c" }}>{negative}</div>
          <div className="admin-stat-label">👎 À améliorer</div>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-card-title">Historique des feedbacks</h2>
        {loading ? (
          <div className="admin-loading">Chargement…</div>
        ) : feedbacks.length === 0 ? (
          <div className="admin-empty">Aucun feedback reçu</div>
        ) : (
          <div className="doc-list">
            {feedbacks.map(fb => (
              <div key={fb.id} className="feedback-row-admin">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "18px" }}>{fb.rating > 0 ? "👍" : "👎"}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-400)" }}>{new Date(fb.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-400)" }}>Question : </span>
                  <span style={{ fontSize: "13px" }}>{fb.question}</span>
                </div>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-400)" }}>Réponse : </span>
                  <span style={{ fontSize: "13px", color: "var(--text-400)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as any}>{fb.answer}</span>
                </div>
                {fb.comment && (
                  <div style={{ marginTop: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-400)" }}>Commentaire : </span>
                    <span style={{ fontSize: "13px" }}>{fb.comment}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Config tab ─────────────────────────────────────── */
function ConfigTab({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [saveError, setSaveError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/conseil/admin/config`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) { onSessionExpired(); return null; }
        return r.json();
      })
      .then(d => { if (d) setConfig(d); })
      .catch(() => setLoadError("Impossible de charger la configuration."));
  }, []);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setPwError(""); setSaveError("");
    if (newPassword) {
      if (newPassword !== confirmPassword) { setPwError("Les mots de passe ne correspondent pas"); return; }
      if (newPassword.length < 6) { setPwError("Mot de passe trop court (min 6 caractères)"); return; }
    }
    setSaving(true); setSuccess("");
    try {
      const res = await fetch(`${API_BASE}/conseil/admin/config`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, ...(newPassword ? { newPassword } : {}) }),
      });
      if (res.status === 401) { onSessionExpired(); return; }
      if (!res.ok) throw new Error("Erreur de sauvegarde");
      const updated = await res.json();
      setConfig(updated);
      setSuccess("Configuration sauvegardée !");
      setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erreur de sauvegarde");
    }
    finally { setSaving(false); }
  }

  if (!config) return (
    <div className="admin-loading" style={{ padding: "48px 0" }}>
      {loadError ? <p className="admin-error">{loadError}</p> : "Chargement…"}
    </div>
  );

  return (
    <form onSubmit={saveConfig} className="admin-section">
      <div className="admin-card">
        <h2 className="admin-card-title">Apparence du bot</h2>
        <div className="admin-grid-2">
          <div className="admin-field">
            <label>Nom du bot</label>
            <input type="text" value={config.botName} onChange={e => setConfig({ ...config, botName: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Message d'accueil</label>
            <input type="text" value={config.greeting} onChange={e => setConfig({ ...config, greeting: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Couleur principale</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="color" value={config.primaryColor} onChange={e => setConfig({ ...config, primaryColor: e.target.value })} style={{ width: "48px", height: "36px", padding: "2px", borderRadius: "6px", border: "1px solid var(--border)", cursor: "pointer" }} />
              <input type="text" value={config.primaryColor} onChange={e => setConfig({ ...config, primaryColor: e.target.value })} style={{ flex: 1 }} />
            </div>
          </div>
          <div className="admin-field">
            <label>Couleur secondaire</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="color" value={config.secondaryColor} onChange={e => setConfig({ ...config, secondaryColor: e.target.value })} style={{ width: "48px", height: "36px", padding: "2px", borderRadius: "6px", border: "1px solid var(--border)", cursor: "pointer" }} />
              <input type="text" value={config.secondaryColor} onChange={e => setConfig({ ...config, secondaryColor: e.target.value })} style={{ flex: 1 }} />
            </div>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-card-title">Paramètres du modèle</h2>
        <div className="admin-field">
          <label>Prompt système</label>
          <textarea value={config.systemPrompt} onChange={e => setConfig({ ...config, systemPrompt: e.target.value })} rows={5} />
        </div>
        <div className="admin-grid-2">
          <div className="admin-field">
            <label>Tokens max ({config.maxTokens})</label>
            <input type="range" min={500} max={4000} step={100} value={config.maxTokens} onChange={e => setConfig({ ...config, maxTokens: Number(e.target.value) })} style={{ width: "100%", marginTop: "4px" }} />
          </div>
          <div className="admin-field">
            <label>Température ({config.temperature})</label>
            <input type="range" min={0} max={1} step={0.05} value={config.temperature} onChange={e => setConfig({ ...config, temperature: Number(e.target.value) })} style={{ width: "100%", marginTop: "4px" }} />
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-card-title">Sécurité</h2>
        <div className="admin-grid-2">
          <div className="admin-field">
            <label>Nouveau mot de passe admin</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Laisser vide pour ne pas modifier" />
          </div>
          <div className="admin-field">
            <label>Confirmer le mot de passe</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirmer le nouveau mot de passe" />
          </div>
        </div>
        {pwError && <p className="admin-error">{pwError}</p>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button type="submit" disabled={saving} className="admin-submit-btn">
          {saving ? "Sauvegarde…" : "Sauvegarder la configuration"}
        </button>
        {success && <p className="admin-success">{success}</p>}
        {saveError && <p className="admin-error">{saveError}</p>}
      </div>
    </form>
  );
}

/* ─── Landing Page ───────────────────────────────────── */
function LandingPage({ onEnter, onAdmin }: { onEnter: () => void; onAdmin: () => void }) {
  return (
    <div className="landing-page">
      <div className="landing-bg" />
      <div className="landing-content">
        <div className="landing-logo-wrap">
          <img src={councillogo} alt="Conseil de la Concurrence" className="landing-logo" />
        </div>

        <div className="landing-hero">
          <img src={chatbotLogo} alt="Chatbot" className="landing-bot-avatar" />
          <h1 className="landing-title">Chatbot IA Mounafassa</h1>
          <p className="landing-subtitle">
            Assistant juridique intelligent spécialisé en droit marocain de la concurrence,
            basé sur les textes officiels du Conseil de la Concurrence.
          </p>

          <div className="landing-features">
            <div className="landing-feature">
              <span className="landing-feature-icon">⚖️</span>
              <span>Droit de la concurrence marocain</span>
            </div>
            <div className="landing-feature">
              <span className="landing-feature-icon">📄</span>
              <span>Textes officiels & décisions du Conseil</span>
            </div>
            <div className="landing-feature">
              <span className="landing-feature-icon">🤖</span>
              <span>Intelligence artificielle avancée</span>
            </div>
            <div className="landing-feature">
              <span className="landing-feature-icon">🔒</span>
              <span>Réponses fiables et sourcées</span>
            </div>
          </div>

          <button className="landing-cta" onClick={onEnter}>
            Accéder au Chatbot
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>

        <div className="landing-footer">
          <p>© {new Date().getFullYear()} Conseil de la Concurrence — Royaume du Maroc</p>
          <button className="landing-admin-link" onClick={onAdmin}>
            <Settings size={13} />
            Administration
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Root App ───────────────────────────────────────── */
export default function App() {
  const [page, setPage] = useState<"landing" | "chat" | "admin">("landing");
  const [botConfig, setBotConfig] = useState<BotConfig>({
    botName: "Chatbot IA Conseil",
    greeting: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
    primaryColor: "#1B4332",
    secondaryColor: "#2D6A4F",
  });

  useEffect(() => {
    fetch(`${API_BASE}/conseil/config`)
      .then(r => r.json())
      .then(setBotConfig)
      .catch(() => {});
  }, []);

  if (page === "admin") {
    return (
      <AdminPage
        onBack={() => {
          setPage("landing");
          fetch(`${API_BASE}/conseil/config`).then(r => r.json()).then(setBotConfig).catch(() => {});
        }}
      />
    );
  }

  if (page === "landing") {
    return (
      <LandingPage
        onEnter={() => setPage("chat")}
        onAdmin={() => setPage("admin")}
      />
    );
  }

  return <ChatPage onAdmin={() => setPage("admin")} botConfig={botConfig} />;
}
