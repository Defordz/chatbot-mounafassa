import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, BookOpen, AlertCircle, CheckCircle } from "lucide-react";
import type { ChatMessage as ChatMessageType, RetrievedChunk } from "@/lib/api";
import { SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS } from "@/lib/api";

interface Props {
  message: ChatMessageType;
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 75
      ? "text-green-700 bg-green-50 border-green-200"
      : pct >= 50
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border font-medium ${color}`}>
      {pct >= 75 ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      Confiance : {pct}%
    </span>
  );
}

function ChunkCard({ chunk }: { chunk: RetrievedChunk }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = SOURCE_TYPE_COLORS[chunk.source_type] || SOURCE_TYPE_COLORS.autre;

  return (
    <div className="border border-border rounded-md overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${colorClass}`}>
            {SOURCE_TYPE_LABELS[chunk.source_type] || "Doc"}
          </span>
          <span className="font-medium text-foreground truncate max-w-[200px]">
            {chunk.source_name}
          </span>
          {chunk.article_ref && (
            <span className="text-muted-foreground">{chunk.article_ref}</span>
          )}
          {chunk.page && (
            <span className="text-muted-foreground">p.{chunk.page}</span>
          )}
          <span className="text-muted-foreground ml-auto">
            {Math.round(chunk.confidence * 100)}%
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-2 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-2 flex-shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-card text-muted-foreground leading-relaxed whitespace-pre-wrap border-t border-border">
          {chunk.content}
        </div>
      )}
    </div>
  );
}

export default function ChatMessage({ message }: Props) {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-md text-sm leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col mb-5">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <BookOpen className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`bg-card border border-border rounded-2xl rounded-tl-md px-4 py-3 text-sm shadow-sm ${message.isError ? "border-destructive/30 bg-destructive/5" : ""}`}>
            {message.isError ? (
              <div className="flex items-start gap-2 text-destructive">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{message.content}</span>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>

          {message.confidence_score !== undefined && message.sources && message.sources.length > 0 && (
            <div className="mt-2 ml-0">
              <div className="flex items-center gap-3 mb-2">
                <ConfidenceBadge score={message.confidence_score} />
                <button
                  onClick={() => setShowSources(!showSources)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showSources ? "Masquer" : "Voir"} les sources ({message.retrieved_chunks?.length || 0} passages)
                </button>
              </div>

              {showSources && message.retrieved_chunks && (
                <div className="space-y-1.5">
                  {message.retrieved_chunks.map((chunk, i) => (
                    <ChunkCard key={i} chunk={chunk} />
                  ))}
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.sources.map((s, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${SOURCE_TYPE_COLORS[s.source_type] || SOURCE_TYPE_COLORS.autre}`}
                  >
                    {s.source_name}
                    {s.articles.length > 0 && (
                      <span className="opacity-70">({s.articles.slice(0, 3).join(", ")})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-1.5 ml-0.5 text-[11px] text-muted-foreground">
            {message.timestamp.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
