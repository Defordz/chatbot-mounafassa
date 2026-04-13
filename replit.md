# Workspace

## Overview

pnpm workspace monorepo using TypeScript + Python. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (Node.js API server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## LexConc-MA Artifact — Chatbot IA Monafassa

A professional AI legal assistant (RAG chatbot) for the Conseil de la Concurrence du Maroc, specialized in Moroccan competition law (Law 104-12, Law 20-13, merger guidelines, transaction procedure guidelines).

### Architecture
- **Frontend**: React + Vite (artifacts/lexconc-ma) — served at `/`
- **Python RAG Backend**: FastAPI + LangChain + FAISS (artifacts/lexconc-ma/backend) — served at `/lexconc-api`
- **Design**: Custom CSS design system (DM Sans + Playfair Display fonts, green palette #0d2818–#52b788)

### Frontend Features
- **Conversation history**: Conversations persisted in localStorage, grouped by date (today/yesterday/this week/this month/older)
- **Auto-titling**: Conversations auto-named from first message
- **Voice input**: Web Speech API microphone button (French, works in Chrome/Edge)
- **Concurrent messages**: Users can send multiple questions without waiting
- **Responsive**: Works on desktop, mobile, and landscape orientations
- **Markdown rendering**: ReactMarkdown for assistant responses with source citations

### Python Backend
- **File**: `artifacts/lexconc-ma/backend/main.py` — FastAPI app with global error handling
- **RAG Engine**: `artifacts/lexconc-ma/backend/rag.py` — LangChain + FAISS vector search + numpy type safety
- **Documents**: `artifacts/lexconc-ma/backend/data/` — auto-indexed PDFs and DOCX files
- **Vector Store**: `artifacts/lexconc-ma/backend/vector_store/` — FAISS index (auto-generated)
- **Port**: 8765
- **All API errors return JSON** — never plain text or HTML

### Python Dependencies
- `fastapi`, `uvicorn` — web server
- `langchain`, `langchain-openai`, `langchain-community`, `langchain-text-splitters` — RAG orchestration
- `faiss-cpu` — vector store
- `pypdf` — PDF parsing
- `numpy` — vector handling (with explicit float conversion to avoid serialization errors)
- `openai` — LLM + embeddings
- **Requires**: `OPENAI_API_KEY` environment secret

### Internal Knowledge Base
- Place PDF/DOCX files in `artifacts/lexconc-ma/backend/data/` — auto-indexed at startup
- DOCX support via built-in Python zipfile/XML parsing (no external packages needed)
- Expected filenames: `loi_104_12.docx`, `loi_20_13.pdf`, `guidelines_concentration.pdf`, `guidelines_transaction.pdf`
- Knowledge base is private — no user upload/delete capabilities

### Key API Endpoints (all under /lexconc-api/api/)
- `GET /health` — health check (includes indexing status)
- `POST /chat` — RAG-powered Q&A (returns JSONResponse to avoid numpy serialization issues)
- `POST /chat/stream` — SSE streaming endpoint: yields `meta` event (sources/confidence/chunks), then `chunk` events (text tokens), then `[DONE]`
- `GET /stats` — index statistics

### Streaming Implementation
- **Backend**: `rag.py` has `query_stream()` generator that yields meta + text chunks via LangChain streaming LLM. `main.py` wraps it in a thread-bridged async generator to avoid blocking the event loop.
- **Frontend**: `api.ts` has `sendChatMessageStream()` using `ReadableStream` reader + `TextDecoder` to parse SSE lines. Supports `AbortSignal` for cancellation.
- **UI**: Text appears word-by-word with a blinking green cursor (`▌`) during streaming. Cursor disappears when done. Sources appear as soon as the `meta` event arrives.

### Key Frontend Files
- `src/pages/ChatPage.tsx` — main page with sidebar, conversation history, streaming chat, voice input
- `src/components/ChatMessage.tsx` — message bubble with Markdown rendering, source tags, and streaming cursor
- `src/lib/api.ts` — API client with streaming SSE support and AbortController cancellation
- `src/index.css` — full design system (CSS variables, animations, responsive breakpoints)

### Important Assets
- `attached_assets/image_1775927493944.png` — Conseil de la Concurrence logo (used in sidebar + welcome screen)
- `attached_assets/chatbot-ia-monafassa_1775928088645.html` — original HTML design reference

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run Node.js API server locally
- `python3 artifacts/lexconc-ma/backend/main.py` — run Python RAG API server

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
