const PYTHON_API_BASE = "/lexconc-api/api";

export interface RetrievedChunk {
  content: string;
  source_name: string;
  source_type: string;
  source_label: string;
  article_ref: string;
  page: string | number;
  filename: string;
  confidence: number;
  citation: string;
}

export interface Source {
  source_name: string;
  source_type: string;
  source_label: string;
  articles: string[];
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
  confidence_score: number;
  retrieved_chunks: RetrievedChunk[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  confidence_score?: number;
  retrieved_chunks?: RetrievedChunk[];
  timestamp: Date;
  isError?: boolean;
}

export const SOURCE_TYPE_COLORS: Record<string, string> = {
  loi: "bg-blue-100 text-blue-800 border-blue-200",
  ligne_directrice: "bg-green-100 text-green-800 border-green-200",
  communique: "bg-amber-100 text-amber-800 border-amber-200",
  decision: "bg-purple-100 text-purple-800 border-purple-200",
  autre: "bg-gray-100 text-gray-800 border-gray-200",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  loi: "Loi",
  ligne_directrice: "Ligne directrice",
  communique: "Communiqué",
  decision: "Décision",
  autre: "Autre",
};

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text || text.trim() === "") {
    throw new Error("Le serveur n'a renvoyé aucune réponse.");
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error("[API] Non-JSON response:", text.slice(0, 500));
    throw new Error("Réponse invalide du serveur. Veuillez réessayer.");
  }
}

export async function sendChatMessage(
  question: string,
  conversationHistory: Array<{ role: string; content: string }>,
  sourceFilter: string | null
): Promise<ChatResponse> {
  let res: Response;

  try {
    res = await fetch(`${PYTHON_API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        conversation_history: conversationHistory,
        source_filter: sourceFilter,
      }),
    });
  } catch (networkErr: any) {
    console.error("[API] Network error:", networkErr);
    throw new Error("Impossible de joindre le serveur. Vérifiez votre connexion.");
  }

  const data = await safeJson(res);

  if (!res.ok) {
    // The backend always returns JSON with an "answer" field even on error
    // so we can show it nicely in the UI if present
    if (data?.answer) {
      return {
        answer: data.answer,
        sources: data.sources ?? [],
        confidence_score: data.confidence_score ?? 0,
        retrieved_chunks: data.retrieved_chunks ?? [],
      };
    }
    const msg =
      data?.error ||
      data?.detail ||
      `Erreur ${res.status} : ${res.statusText}`;
    throw new Error(msg);
  }

  return {
    answer: data.answer ?? "",
    sources: data.sources ?? [],
    confidence_score: data.confidence_score ?? 0,
    retrieved_chunks: data.retrieved_chunks ?? [],
  };
}

export interface StreamCallbacks {
  onMeta: (data: { sources: Source[]; confidence_score: number; retrieved_chunks: RetrievedChunk[] }) => void;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function sendChatMessageStream(
  question: string,
  conversationHistory: Array<{ role: string; content: string }>,
  sourceFilter: string | null,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let terminated = false;
  const finish = () => { if (!terminated) { terminated = true; callbacks.onDone(); } };
  const fail = (msg: string) => { if (!terminated) { terminated = true; callbacks.onError(msg); } };

  try {
    const res = await fetch(`${PYTHON_API_BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        conversation_history: conversationHistory,
        source_filter: sourceFilter,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text();
      fail(`Erreur ${res.status}: ${text.slice(0, 200)}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      fail("Le navigateur ne supporte pas le streaming.");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (terminated) return;
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            finish();
            return;
          }

          try {
            const data = JSON.parse(payload);
            if (data.type === "meta") {
              callbacks.onMeta({
                sources: data.sources ?? [],
                confidence_score: data.confidence_score ?? 0,
                retrieved_chunks: data.retrieved_chunks ?? [],
              });
            } else if (data.type === "chunk") {
              callbacks.onChunk(data.content);
            } else if (data.type === "error") {
              fail(data.content);
              return;
            }
          } catch {
          }
        }
      }
    } finally {
      try { reader.cancel(); } catch {}
    }

    finish();
  } catch (err: any) {
    if (err?.name === "AbortError") {
      finish();
    } else {
      fail(err?.message || "Impossible de joindre le serveur. Vérifiez votre connexion.");
    }
  }
}

export async function fetchStats(): Promise<{
  total_documents: number;
  total_chunks: number;
  has_vector_store: boolean;
}> {
  let res: Response;
  try {
    res = await fetch(`${PYTHON_API_BASE}/stats`);
  } catch {
    throw new Error("Impossible de joindre le serveur.");
  }
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data?.error || "Erreur de chargement des statistiques");
  return data;
}

export async function checkHealth(): Promise<{
  status: string;
  documents_indexed: boolean;
  total_chunks: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${PYTHON_API_BASE}/health`);
    const data = await safeJson(res);
    return data;
  } catch {
    return { status: "error", documents_indexed: false, total_chunks: 0 };
  }
}
