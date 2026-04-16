import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ThumbsUp, PencilLine, Clipboard, Check } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/lib/api";
import chatbotLogo from "@assets/IMG_0521_1776050301072_transparent.png";

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
  onCopy?: (text: string) => void;
}

const BOT_AVATAR = <img src={chatbotLogo} alt="Monafassa" className="bot-avatar-img" />;

const SVG_BOOK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
);

type FeedbackType = "useful" | "improve";

function loadFeedback() {
  try {
    const raw = localStorage.getItem("lexconc-feedback");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFeedback(items: Array<{ msgId: string; type: FeedbackType; comment: string; timestamp: number }>) {
  try {
    localStorage.setItem("lexconc-feedback", JSON.stringify(items));
  } catch {}
}

export default function ChatMessage({ message, isStreaming, onCopy }: Props) {
  const [showImproveField, setShowImproveField] = useState(false);
  const [improvementText, setImprovementText] = useState("");
  const [copied, setCopied] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(() => {
    const existing = loadFeedback().find((item: any) => item.msgId === message.id);
    return existing?.type ?? null;
  });
  const isUser = message.role === "user";
  const isError = !!message.isError;

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

  if (isError) {
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
  const feedbackItems = loadFeedback();

  const persistFeedback = (type: FeedbackType, comment = "") => {
    const next = feedbackItems.filter((item: any) => item.msgId !== message.id);
    next.push({ msgId: message.id, type, comment, timestamp: Date.now() });
    saveFeedback(next);
  };

  const handleUseful = () => {
    const nextType = feedbackType === "useful" ? null : "useful";
    setFeedbackType(nextType);
    if (!nextType) {
      saveFeedback(feedbackItems.filter((item: any) => item.msgId !== message.id));
      return;
    }
    setShowImproveField(false);
    persistFeedback("useful");
  };

  const handleImprove = () => {
    const nextOpen = !showImproveField;
    setShowImproveField(nextOpen);
    setFeedbackType("improve");
    if (!nextOpen && !improvementText.trim()) return;
    if (nextOpen) return;
    persistFeedback("improve", improvementText.trim());
  };

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

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
              {message.content}
            </ReactMarkdown>
            {isStreaming && <span className="streaming-cursor">▌</span>}
          </div>

          {message.retrieved_chunks && message.retrieved_chunks.length > 0 && (
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

          <div className="feedback-row">
            <button
              className="feedback-btn"
              onClick={() => onCopy?.(message.content)}
              type="button"
            >
              {copied ? <Check size={13} /> : <Clipboard size={13} />}
              Copier
            </button>
            <button className={`feedback-btn ${feedbackType === "useful" ? "active" : ""}`} onClick={handleUseful} type="button">
              <ThumbsUp size={13} />
              Utile
            </button>
            <button className={`feedback-btn ${showImproveField ? "active" : ""}`} onClick={handleImprove} type="button">
              <PencilLine size={13} />
              Améliorer
            </button>
          </div>

          {showImproveField && (
            <div className="feedback-improve">
              <textarea
                value={improvementText}
                onChange={(e) => setImprovementText(e.target.value)}
                placeholder="Expliquez ce qui pourrait être amélioré..."
                rows={3}
              />
              <button
                className="feedback-submit"
                type="button"
                onClick={() => {
                  persistFeedback("improve", improvementText.trim());
                  setShowImproveField(false);
                }}
              >
                Enregistrer
              </button>
            </div>
          )}

          <div className="msg-timestamp">{timeStr}</div>
        </div>
      </div>
    </div>
  );
}
