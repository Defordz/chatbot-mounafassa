import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE = "/api";

function renderMarkdown(text: string): string {
  return text
    .replace(/```([\w]*)\n?([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^(?!<[hup])(.+)$/gm, (m) => (m.startsWith("<") ? m : m))
    .replace(/^([^<].*)$/gm, (m) => (m.trim() ? `<p>${m}</p>` : m))
    .replace(/<p><\/p>/g, "")
    .replace(/<p>(<[hup])/g, "$1")
    .replace(/(<\/[hup][^>]*>)<\/p>/g, "$1");
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
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

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const now = Date.now();
  const day = 86400000;
  const groups: Record<string, Conversation[]> = { "Aujourd'hui": [], "Hier": [], "7 derniers jours": [], "Plus ancien": [] };
  for (const c of conversations) {
    const diff = now - c.createdAt;
    if (diff < day) groups["Aujourd'hui"].push(c);
    else if (diff < 2 * day) groups["Hier"].push(c);
    else if (diff < 7 * day) groups["7 derniers jours"].push(c);
    else groups["Plus ancien"].push(c);
  }
  return groups;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span>
      {[1,2,3,4,5].map(i => (
        <span key={i} className={i <= rating ? "rating-star" : "text-muted-foreground"}>★</span>
      ))}
    </span>
  );
}

export default function App() {
  const [page, setPage] = useState<"chat" | "admin">("chat");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("conseil-theme") === "dark");
  const [config, setConfig] = useState<BotConfig>({
    botName: "Assistant IA",
    greeting: "Bonjour ! Comment puis-je vous aider ?",
    primaryColor: "#1B4332",
    secondaryColor: "#2D6A4F",
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("conseil-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    fetch(`${API_BASE}/conseil/config`)
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const hex = config.primaryColor;
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2*l - 1));
    let h = 0;
    if (d !== 0) {
      if (max === r/255) h = ((g-b)/255/d) % 6;
      else if (max === g/255) h = (b-r)/255/d + 2;
      else h = (r-g)/255/d + 4;
    }
    h = Math.round(((h * 60) + 360) % 360);
    root.style.setProperty("--primary", `${h} ${Math.round(s*100)}% ${Math.round(l*100)}%`);
    root.style.setProperty("--ring", `${h} ${Math.round(s*100)}% ${Math.round(l*100)}%`);
  }, [config.primaryColor]);

  if (page === "admin") {
    return <AdminPage onBack={() => { setPage("chat"); setConfig(prev => ({...prev})); }} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />;
  }

  return <ChatPage config={config} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} onAdmin={() => setPage("admin")} />;
}

function ChatPage({ config, darkMode, onToggleDark, onAdmin }: {
  config: BotConfig;
  darkMode: boolean;
  onToggleDark: () => void;
  onAdmin: () => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try { return JSON.parse(localStorage.getItem("conseil-history") || "[]"); } catch { return []; }
  });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const saveConversations = useCallback((convs: Conversation[]) => {
    setConversations(convs);
    localStorage.setItem("conseil-history", JSON.stringify(convs.slice(0, 50)));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: genId(),
        role: "assistant",
        content: config.greeting,
        timestamp: Date.now(),
      }]);
    }
  }, [config.greeting]);

  function newChat() {
    setCurrentId(null);
    setMessages([{
      id: genId(),
      role: "assistant",
      content: config.greeting,
      timestamp: Date.now(),
    }]);
    inputRef.current?.focus();
  }

  function loadConversation(conv: Conversation) {
    setCurrentId(conv.id);
    setMessages(conv.messages);
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = conversations.filter(c => c.id !== id);
    saveConversations(updated);
    if (currentId === id) newChat();
  }

  function toggleVoice() {
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: typeof globalThis.SpeechRecognition; webkitSpeechRecognition?: typeof globalThis.SpeechRecognition }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: typeof globalThis.SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Votre navigateur ne supporte pas la reconnaissance vocale."); return; }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "fr-FR";
    rec.continuous = false;
    rec.interimResults = false;
    recognitionRef.current = rec;

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { id: genId(), role: "user", content: text, timestamp: Date.now() };
    const assistantMsg: Message = { id: genId(), role: "assistant", content: "", streaming: true, timestamp: Date.now() };

    const prevMessages = messages.filter(m => !m.streaming);
    const newMessages = [...prevMessages, userMsg, assistantMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const history = prevMessages.slice(1).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_BASE}/conseil/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
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
              setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullText } : m));
            }
            if (evt.done) {
              setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullText, streaming: false } : m));
            }
            if (evt.error) throw new Error(evt.error);
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }

      const finalMsgs = newMessages.map(m => m.id === assistantMsg.id ? { ...m, content: fullText, streaming: false } : m);
      setMessages(finalMsgs);

      const convTitle = text.length > 40 ? text.slice(0, 40) + "…" : text;
      let updatedConvs: Conversation[];
      if (currentId) {
        updatedConvs = conversations.map(c => c.id === currentId ? { ...c, messages: finalMsgs, title: c.title } : c);
      } else {
        const newConv: Conversation = { id: genId(), title: convTitle, messages: finalMsgs, createdAt: Date.now() };
        setCurrentId(newConv.id);
        updatedConvs = [newConv, ...conversations];
      }
      saveConversations(updatedConvs);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Une erreur est survenue";
      setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: `❌ ${errMsg}`, streaming: false } : m));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  async function copyMessage(content: string, id: string) {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function submitFeedback(msg: Message, rating: number) {
    const userMsg = messages.find(m => m.timestamp < msg.timestamp && m.role === "user");
    if (!userMsg) return;
    await fetch(`${API_BASE}/conseil/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: userMsg.content, answer: msg.content, rating }),
    }).catch(() => {});
  }

  const groups = groupByDate(conversations);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`conseil-sidebar ${sidebarOpen ? "" : "collapsed"} flex flex-col border-r border-border bg-card z-50`}>
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="font-semibold text-sm text-primary">{config.botName}</span>
          <button onClick={() => setSidebarOpen(false)} className="btn-ghost p-1.5 text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="p-2">
          <button onClick={newChat} className="w-full flex items-center gap-2 btn-ghost text-sm py-2 px-3 border border-border rounded-lg hover:border-primary/50">
            <span>✏️</span> Nouvelle conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2">
          {Object.entries(groups).map(([group, convs]) =>
            convs.length > 0 ? (
              <div key={group} className="mb-3">
                <div className="text-xs font-medium text-muted-foreground px-1 py-1">{group}</div>
                {convs.map(c => (
                  <div key={c.id} className={`history-item group flex items-center justify-between ${currentId === c.id ? "active" : ""}`} onClick={() => loadConversation(c)}>
                    <span className="truncate flex-1">{c.title}</span>
                    <button onClick={(e) => deleteConversation(c.id, e)} className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive ml-1 text-xs px-1">✕</button>
                  </div>
                ))}
              </div>
            ) : null
          )}
          {conversations.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-6">Aucune conversation</div>
          )}
        </div>

        <div className="p-2 border-t border-border space-y-1">
          <button onClick={onAdmin} className="w-full flex items-center gap-2 btn-ghost text-sm py-2 px-3 text-muted-foreground">
            <span>⚙️</span> Administration
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(s => !s)} className="btn-ghost p-2" title="Ouvrir/fermer la barre latérale">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-semibold text-base">{config.botName}</span>
            <span className="badge badge-green hidden sm:inline-flex">En ligne</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onToggleDark} className="btn-ghost p-2" title="Changer le thème">
              {darkMode ? "☀️" : "🌙"}
            </button>
            <button onClick={newChat} className="btn-ghost p-2 text-muted-foreground" title="Nouvelle conversation">
              ✏️
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
          <div className="max-w-3xl mx-auto w-full space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold mr-2 flex-shrink-0 mt-1">
                    {config.botName.slice(0, 1)}
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === "user" ? "order-first" : ""}`}>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border border-border rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div
                        className={`prose-conseil ${msg.streaming ? "streaming-cursor" : ""}`}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || "…") }}
                      />
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>

                  {msg.role === "assistant" && !msg.streaming && msg.content && (
                    <div className="flex items-center gap-1 mt-1 ml-1">
                      <button
                        onClick={() => copyMessage(msg.content, msg.id)}
                        className="btn-ghost text-muted-foreground text-xs py-0.5 px-1.5"
                        title="Copier"
                      >
                        {copiedId === msg.id ? "✓" : "📋"}
                      </button>
                      <button onClick={() => submitFeedback(msg, 1)} className="btn-ghost text-muted-foreground text-xs py-0.5 px-1" title="Réponse utile">👍</button>
                      <button onClick={() => submitFeedback(msg, -1)} className="btn-ghost text-muted-foreground text-xs py-0.5 px-1" title="Réponse à améliorer">👎</button>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-sm font-bold ml-2 flex-shrink-0 mt-1">
                    U
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="conseil-input-area flex items-end gap-2 px-4 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question…"
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-sm py-1 max-h-36 scrollbar-thin"
                style={{ minHeight: "1.5rem" }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 144) + "px";
                }}
                disabled={loading}
              />
              <div className="flex items-center gap-1 pb-0.5">
                <button
                  onClick={toggleVoice}
                  className={`btn-ghost p-2 text-muted-foreground ${listening ? "text-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}
                  title={listening ? "Arrêter la dictée" : "Dictée vocale"}
                >
                  🎤
                </button>
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  className="btn-primary py-2 px-3 text-sm"
                >
                  {loading ? "…" : "Envoyer"}
                </button>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-1.5">
              Alimenté par Claude AI · Modèle : claude-sonnet-4-6
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPage({ onBack, darkMode, onToggleDark }: {
  onBack: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const [tab, setTab] = useState<"documents" | "feedback" | "config">("documents");
  const [token, setToken] = useState(() => localStorage.getItem("conseil-admin-token") || "");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

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
      localStorage.setItem("conseil-admin-token", t);
    } catch { setLoginError("Erreur de connexion"); }
    finally { setLoginLoading(false); }
  }

  function logout() {
    setToken("");
    localStorage.removeItem("conseil-admin-token");
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm shadow-lg">
          <button onClick={onBack} className="btn-ghost text-sm text-muted-foreground mb-6 flex items-center gap-1">
            ← Retour au chat
          </button>
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">⚙️</div>
            <h1 className="text-xl font-bold">Administration</h1>
            <p className="text-sm text-muted-foreground mt-1">Accès restreint</p>
          </div>
          <form onSubmit={login} className="space-y-4">
            <div>
              <label>Mot de passe</label>
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Mot de passe admin" />
              {loginError && <p className="text-destructive text-sm mt-1">{loginError}</p>}
            </div>
            <button type="submit" disabled={loginLoading} className="btn-primary w-full">
              {loginLoading ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-ghost p-2 text-muted-foreground">←</button>
          <span className="font-bold text-lg">Administration</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onToggleDark} className="btn-ghost p-2">{darkMode ? "☀️" : "🌙"}</button>
          <button onClick={logout} className="btn-ghost text-sm text-muted-foreground">Déconnexion</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-0 border-b border-border mb-6">
          {(["documents", "feedback", "config"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors capitalize ${tab === t ? "tab-active" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "documents" ? "📄 Documents" : t === "feedback" ? "💬 Feedback" : "⚙️ Configuration"}
            </button>
          ))}
        </div>

        {tab === "documents" && <DocumentsTab token={token} />}
        {tab === "feedback" && <FeedbackTab token={token} />}
        {tab === "config" && <ConfigTab token={token} />}
      </div>
    </div>
  );
}

function DocumentsTab({ token }: { token: string }) {
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
      setSuccess(`Document ajouté avec succès (${data.chunksProcessed} segments indexés)`);
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
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-4">Ajouter un document</h2>
        <form onSubmit={uploadDoc} className="space-y-3">
          <div>
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
            <input ref={fileRef} type="file" accept=".pdf,.txt,.text" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
            {selectedFile ? (
              <div>
                <p className="font-medium text-sm">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
              </div>
            ) : (
              <div>
                <p className="text-2xl mb-1">📄</p>
                <p className="text-sm font-medium">Cliquez ou glissez un fichier ici</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, TXT (max 20 MB)</p>
              </div>
            )}
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          {success && <p className="text-green-600 dark:text-green-400 text-sm">{success}</p>}
          <button type="submit" disabled={uploading || !selectedFile} className="btn-primary">
            {uploading ? "Traitement en cours…" : "Indexer le document"}
          </button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-4">Documents ({docs.length})</h2>
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Chargement…</div>
        ) : docs.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">Aucun document indexé</div>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">{doc.originalFilename} · {formatBytes(doc.size)} · {new Date(doc.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className={`badge ${doc.active ? "badge-green" : "badge-red"}`}>{doc.active ? "Actif" : "Inactif"}</span>
                  <button onClick={() => toggleDoc(doc.id, !doc.active)} className="btn-ghost text-xs py-1 px-2">{doc.active ? "Désactiver" : "Activer"}</button>
                  <button onClick={() => deleteDoc(doc.id)} className="btn-ghost text-xs py-1 px-2 text-destructive hover:bg-destructive/10">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackTab({ token }: { token: string }) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/conseil/admin/feedbacks`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setFeedbacks(Array.isArray(d) ? d : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const positive = feedbacks.filter(f => f.rating > 0).length;
  const negative = feedbacks.filter(f => f.rating < 0).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{feedbacks.length}</div>
          <div className="text-sm text-muted-foreground">Total</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{positive}</div>
          <div className="text-sm text-muted-foreground">👍 Utiles</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{negative}</div>
          <div className="text-sm text-muted-foreground">👎 À améliorer</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-4">Historique des feedbacks</h2>
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Chargement…</div>
        ) : feedbacks.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">Aucun feedback reçu</div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map(fb => (
              <div key={fb.id} className="p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-lg ${fb.rating > 0 ? "text-green-500" : "text-red-500"}`}>{fb.rating > 0 ? "👍" : "👎"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(fb.createdAt).toLocaleString("fr-FR")}</span>
                </div>
                <div className="space-y-1.5">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Question : </span>
                    <span className="text-sm">{fb.question}</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Réponse : </span>
                    <span className="text-sm text-muted-foreground line-clamp-2">{fb.answer}</span>
                  </div>
                  {fb.comment && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">Commentaire : </span>
                      <span className="text-sm">{fb.comment}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigTab({ token }: { token: string }) {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/conseil/admin/config`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setPwError("");

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
      if (!res.ok) throw new Error("Erreur de sauvegarde");
      const updated = await res.json();
      setConfig(updated);
      setSuccess("Configuration sauvegardée avec succès !");
      setNewPassword(""); setConfirmPassword("");
    } catch { setSuccess(""); alert("Erreur de sauvegarde"); }
    finally { setSaving(false); }
  }

  if (!config) return <div className="text-center text-muted-foreground py-8">Chargement…</div>;

  return (
    <form onSubmit={saveConfig} className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">Apparence du bot</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label>Nom du bot</label>
            <input type="text" value={config.botName} onChange={e => setConfig({ ...config, botName: e.target.value })} />
          </div>
          <div>
            <label>Message d'accueil</label>
            <input type="text" value={config.greeting} onChange={e => setConfig({ ...config, greeting: e.target.value })} />
          </div>
          <div>
            <label>Couleur principale</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={config.primaryColor} onChange={e => setConfig({ ...config, primaryColor: e.target.value })} className="w-12 h-9 rounded cursor-pointer border border-border p-0.5" style={{ width: "48px", padding: "2px" }} />
              <input type="text" value={config.primaryColor} onChange={e => setConfig({ ...config, primaryColor: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div>
            <label>Couleur secondaire</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={config.secondaryColor} onChange={e => setConfig({ ...config, secondaryColor: e.target.value })} className="w-12 h-9 rounded cursor-pointer border border-border p-0.5" style={{ width: "48px", padding: "2px" }} />
              <input type="text" value={config.secondaryColor} onChange={e => setConfig({ ...config, secondaryColor: e.target.value })} className="flex-1" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">Paramètres du modèle</h2>
        <div>
          <label>Prompt système</label>
          <textarea value={config.systemPrompt} onChange={e => setConfig({ ...config, systemPrompt: e.target.value })} rows={5} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label>Tokens max ({config.maxTokens})</label>
            <input type="range" min={500} max={4000} step={100} value={config.maxTokens} onChange={e => setConfig({ ...config, maxTokens: Number(e.target.value) })} className="w-full mt-1" />
          </div>
          <div>
            <label>Température ({config.temperature})</label>
            <input type="range" min={0} max={1} step={0.05} value={config.temperature} onChange={e => setConfig({ ...config, temperature: Number(e.target.value) })} className="w-full mt-1" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">Sécurité</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label>Nouveau mot de passe admin</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Laisser vide pour ne pas modifier" />
          </div>
          <div>
            <label>Confirmer le mot de passe</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirmer le nouveau mot de passe" />
          </div>
        </div>
        {pwError && <p className="text-destructive text-sm">{pwError}</p>}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Sauvegarde…" : "Sauvegarder la configuration"}
        </button>
        {success && <p className="text-green-600 dark:text-green-400 text-sm">{success}</p>}
      </div>
    </form>
  );
}
