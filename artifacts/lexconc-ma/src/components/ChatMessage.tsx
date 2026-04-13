import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/lib/api";

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
}

const SVG_BOT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="3"/>
    <circle cx="9" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="14" r="1.5" fill="currentColor"/>
    <path d="M12 2v6"/><circle cx="12" cy="2" r="1" fill="currentColor"/>
  </svg>
);

const SVG_BOOK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);

export default function ChatMessage({ message, isStreaming }: Props) {
  const [showChunks, setShowChunks] = useState(false);
  const isUser = message.role === "user";

  const timeStr = message.timestamp.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isUser) {
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
          <div className="msg-avatar">{SVG_BOT}</div>
          <div className="msg-content-wrap">
            <div className="msg-bubble error">{message.content}</div>
            <div className="msg-timestamp">{timeStr}</div>
          </div>
        </div>
      </div>
    );
  }

  const uniqueSources = message.sources?.map(s => s.source_name).filter(Boolean) ?? [];

  return (
    <div className="msg-row assistant">
      <div className="msg-wrapper">
        <div className="msg-avatar">{SVG_BOT}</div>
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
              {message.content}
            </ReactMarkdown>
            {isStreaming && <span className="streaming-cursor">▌</span>}
          </div>

          {uniqueSources.length > 0 && (
            <div className="source-tags">
              {uniqueSources.slice(0, 5).map((src, i) => (
                <span key={i} className="source-tag">
                  {SVG_BOOK}
                  {src}
                </span>
              ))}
              {message.retrieved_chunks && message.retrieved_chunks.length > 0 && (
                <button
                  onClick={() => setShowChunks(!showChunks)}
                  className="source-tag"
                  style={{ cursor: "pointer" }}
                >
                  {showChunks ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {showChunks ? "Masquer" : "Voir"} passages ({message.retrieved_chunks.length})
                </button>
              )}
            </div>
          )}

          {showChunks && message.retrieved_chunks && (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {message.retrieved_chunks.map((chunk, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    background: "rgba(45,106,79,0.04)",
                    border: "1px solid rgba(45,106,79,0.1)",
                    fontSize: "12px",
                    color: "var(--text-700)",
                    lineHeight: "1.65",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--green-700)", marginBottom: "5px", fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                    <span>{chunk.source_name}{chunk.article_ref ? ` · ${chunk.article_ref}` : ""}{chunk.page ? ` · p.${chunk.page}` : ""}</span>
                    <span style={{ color: "var(--text-300)" }}>{Math.round(chunk.confidence * 100)}%</span>
                  </div>
                  {chunk.content}
                </div>
              ))}
            </div>
          )}

          <div className="msg-timestamp">{timeStr}</div>
        </div>
      </div>
    </div>
  );
}
