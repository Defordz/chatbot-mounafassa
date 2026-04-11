const PYTHON_API_BASE = "/lexconc-api/api";

export interface Document {
  filename: string;
  source_type: string;
  source_name: string;
  chunks: number;
  pages: number;
}

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

export interface StatsResponse {
  total_documents: number;
  total_chunks: number;
  has_vector_store: boolean;
  documents: Document[];
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

export async function fetchDocuments(): Promise<Document[]> {
  const res = await fetch(`${PYTHON_API_BASE}/documents`);
  if (!res.ok) throw new Error("Erreur de chargement des documents");
  const data = await res.json();
  return data.documents;
}

export async function uploadDocument(
  file: File,
  sourceType: string,
  sourceName: string
): Promise<{ success: boolean; message: string; chunks_added: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source_type", sourceType);
  formData.append("source_name", sourceName);

  const res = await fetch(`${PYTHON_API_BASE}/documents/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Erreur lors du téléchargement");
  }
  return res.json();
}

export async function deleteDocument(filename: string): Promise<void> {
  const res = await fetch(
    `${PYTHON_API_BASE}/documents/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error("Erreur lors de la suppression");
}

export async function sendChatMessage(
  question: string,
  conversationHistory: Array<{ role: string; content: string }>,
  sourceFilter: string | null
): Promise<ChatResponse> {
  const res = await fetch(`${PYTHON_API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      conversation_history: conversationHistory,
      source_filter: sourceFilter,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Erreur de traitement");
  }
  return res.json();
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${PYTHON_API_BASE}/stats`);
  if (!res.ok) throw new Error("Erreur de chargement des statistiques");
  return res.json();
}
