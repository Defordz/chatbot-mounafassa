import { useState, useEffect, useRef, useCallback } from "react";
import conseilLogo from "./assets/conseil-logo.png";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

type Message = { role: "user" | "assistant"; content: string; id: string };
type View = "chat" | "admin";
type AdminTab = "documents" | "feedbacks" | "analytics" | "settings";

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [adminToken, setAdminToken] = useState<string | null>(getToken());

  return (
    <QueryClientProvider client={queryClient}>
      {view === "chat" ? (
        <ChatView onGoAdmin={() => setView("admin")} />
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

function ChatView({ onGoAdmin }: { onGoAdmin: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [welcomeMsg, setWelcomeMsg] = useState(
    "Bonjour ! Je suis Monafassa, votre assistant juridique du Conseil de la Concurrence du Maroc. Comment puis-je vous aider ?"
  );
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<{ id: string; status: "copied" | "error" } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = (msg: Message) => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopyState({ id: msg.id, status: "copied" });
      setTimeout(() => setCopyState(null), 2000);
    }).catch(() => {
      setCopyState({ id: msg.id, status: "error" });
      setTimeout(() => setCopyState(null), 2000);
    });
  };

  const handleShare = (msg: Message) => {
    if (navigator.share) {
      navigator.share({
        title: "Réponse juridique – Monafassa",
        text: msg.content,
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") {
          handleCopy(msg);
        }
      });
    } else {
      handleCopy(msg);
    }
  };

  useEffect(() => {
    apiFetch("/monafassa/settings").then((s: any) => {
      if (s.welcome_message) setWelcomeMsg(s.welcome_message);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim(), id: Date.now().toString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const sessionMessages = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_BASE}/monafassa/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, session_messages: sessionMessages }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Erreur serveur: ${res.status}`);
      }

      const assistantId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { role: "assistant", content: "", id: assistantId }]);
      setStreamingId(assistantId);

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
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + parsed.delta } : m
              ));
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Désolé, une erreur est survenue. Veuillez réessayer.",
        id: (Date.now() + 2).toString()
      }]);
    } finally {
      setStreamingId(null);
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="header-left">
          <img src={conseilLogo} alt="Conseil de la Concurrence" className="logo-icon" />
          <div>
            <h1>Monafassa</h1>
            <span className="subtitle">Assistant juridique du Conseil de la Concurrence</span>
          </div>
        </div>
        <button className="admin-btn" onClick={onGoAdmin} title="Administration">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/>
          </svg>
        </button>
      </header>

      <main className="chat-main">
        {messages.length === 0 && (
          <div className="welcome">
            <div className="welcome-icon">⚖️</div>
            <p className="welcome-text">{welcomeMsg}</p>
            <div className="suggestions">
              {["Qu'est-ce que la loi 104-12 sur la concurrence ?", "Quelles sont les pratiques anticoncurrentielles ?", "Comment déposer une plainte ?"].map(s => (
                <button key={s} className="suggestion-btn" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {msg.role === "assistant" && (
              <div className="avatar assistant-avatar">⚖️</div>
            )}
            <div className="message-bubble">
              <MessageContent content={msg.content} isStreaming={msg.id === streamingId} />
              {msg.role === "assistant" && msg.content && msg.id !== streamingId && (
                <div className="msg-actions">
                  <button
                    className={`action-btn copy-btn ${copyState?.id === msg.id ? copyState.status : ""}`}
                    onClick={() => handleCopy(msg)}
                    title="Copier la réponse"
                  >
                    {copyState?.id === msg.id && copyState.status === "copied" ? (
                      <span className="copied-label">✓ Copié !</span>
                    ) : copyState?.id === msg.id && copyState.status === "error" ? (
                      <span className="copied-label copy-error">✗ Erreur</span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    )}
                  </button>
                  {typeof navigator.share === "function" && (
                    <button
                      className="action-btn share-btn"
                      onClick={() => handleShare(msg)}
                      title="Partager la réponse"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                      </svg>
                    </button>
                  )}
                  <button className="action-btn" onClick={() => setFeedbackOpen(msg.id)} title="Évaluer cette réponse">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </button>
                </div>
              )}
              {feedbackOpen === msg.id && (
                <FeedbackForm
                  msgId={msg.id}
                  messages={messages}
                  onClose={() => setFeedbackOpen(null)}
                />
              )}
            </div>
            {msg.role === "user" && (
              <div className="avatar user-avatar">👤</div>
            )}
          </div>
        ))}

        {loading && !streamingId && (
          <div className="message assistant">
            <div className="avatar assistant-avatar">⚖️</div>
            <div className="message-bubble typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="chat-footer">
        <div className="input-row">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Posez votre question juridique..."
            rows={1}
            disabled={loading}
            className="chat-input"
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()} className="send-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p className="disclaimer">Les réponses sont générées par IA et ne remplacent pas un avis juridique professionnel.</p>
      </footer>
    </div>
  );
}

function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  if (!content && !isStreaming) return null;
  if (!content) return <span className="streaming-cursor" aria-hidden="true" />;
  const html = content
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/^\- (.*$)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return (
    <>
      <div className="msg-content" dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }} />
      {isStreaming && <span className="streaming-cursor" aria-hidden="true" />}
    </>
  );
}

function FeedbackForm({ msgId, messages, onClose }: { msgId: string; messages: Message[]; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  const msgIdx = messages.findIndex(m => m.id === msgId);
  const answer = messages[msgIdx]?.content || "";
  const question = messages[msgIdx - 1]?.content || "";

  const submit = async () => {
    if (!rating) return;
    try {
      await apiFetch("/monafassa/feedback", {
        method: "POST",
        body: JSON.stringify({ message: question, answer, rating, comment }),
      });
      setSent(true);
      setTimeout(onClose, 1500);
    } catch {}
  };

  if (sent) return <div className="feedback-sent">Merci pour votre retour ! ✓</div>;

  return (
    <div className="feedback-form">
      <p>Évaluez cette réponse :</p>
      <div className="stars">
        {[1,2,3,4,5].map(s => (
          <button key={s} onClick={() => setRating(s)} className={`star ${s <= rating ? "active" : ""}`}>★</button>
        ))}
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Commentaire optionnel..." rows={2} className="feedback-comment" />
      <div className="feedback-actions">
        <button onClick={onClose} className="btn-cancel">Annuler</button>
        <button onClick={submit} disabled={!rating} className="btn-submit">Envoyer</button>
      </div>
    </div>
  );
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
      const res = await apiFetch("/monafassa/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onLogin(res.token);
    } catch (err: any) {
      setError(err.message || "Mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="login-card">
        <div className="login-logo">⚖️</div>
        <h2>Administration Monafassa</h2>
        <form onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Mot de passe administrateur"
            className="login-input"
            autoFocus
          />
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
    try {
      const res = await apiFetch("/monafassa/admin/documents");
      setDocs(res.documents || []);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = getToken();
      const res = await fetch(`${API_BASE}/monafassa/admin/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce document ?")) return;
    try {
      await apiFetch(`/monafassa/admin/documents/${id}`, { method: "DELETE" });
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="tab-content">
      <div className="tab-header">
        <h2>Documents ({docs.length})</h2>
        <label className="upload-btn">
          {uploading ? "Upload..." : "+ Ajouter PDF"}
          <input type="file" accept=".pdf" onChange={handleUpload} disabled={uploading} hidden />
        </label>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {loading ? <div className="loading">Chargement...</div> : (
        <table className="data-table">
          <thead><tr><th>Nom</th><th>Taille</th><th>Statut</th><th>Action</th></tr></thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td className="doc-name">{d.name}</td>
                <td>{d.size ? `${Math.round(d.size / 1024)} KB` : "-"}</td>
                <td><span className={`status-badge ${d.status}`}>{d.status}</span></td>
                <td>
                  <button onClick={() => handleDelete(d.id)} className="delete-btn">🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
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
          <div className="stat-card">
            <span className="stat-val">
              {data.totals.total_queries > 0 ? Math.round((data.totals.total_cache_hits / data.totals.total_queries) * 100) : 0}%
            </span>
            <span className="stat-label">Taux cache</span>
          </div>
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
          <table className="data-table mt-4">
            <thead><tr><th>Date</th><th>Requêtes</th><th>Cache hits</th></tr></thead>
            <tbody>
              {data.daily.map((d: any) => (
                <tr key={d.date}><td>{d.date}</td><td>{d.queries}</td><td>{d.cache_hits}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const [form, setForm] = useState({
    system_prompt: "",
    welcome_message: "",
    max_tokens: 3000,
    temperature: 0.1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/monafassa/admin/settings").then((s: any) => {
      setForm({
        system_prompt: s.system_prompt || "",
        welcome_message: s.welcome_message || "",
        max_tokens: s.max_tokens || 3000,
        temperature: s.temperature ?? 0.1,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/monafassa/admin/settings", { method: "PUT", body: JSON.stringify(form) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    finally { setSaving(false); }
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
          <label>Prompt système (laissez vide pour le prompt par défaut)</label>
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
