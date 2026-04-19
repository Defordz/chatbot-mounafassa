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
- Knowledge base is private — no user upload/delete capabilities
- **18 documents indexed (6,047 chunks)**:
  - Laws: `loi_104_12.docx`, `loi_20_13.pdf`
  - Guidelines: `guidelines_concentration.pdf`, `guidelines_transaction.pdf`
  - Avis (14): `avis_soins_medicaux_cliniques.pdf`, `avis_gestion_deleguee_transport.pdf`, `avis_medicament.pdf`, `avis_paiement_en_ligne.pdf`, `avis_electricite.pdf`, `avis_fruits_legumes.pdf`, `avis_livre_scolaire.pdf`, `avis_assurance.pdf`, `avis_marche_meunier.pdf`, `avis_circuits_distribution.pdf`, `avis_flambee_prix_intrants.pdf`, `avis_marche_ciment.pdf`, `avis_rond_a_beton.pdf`, `avis_distribution_produits_alimentaires.pdf`
- Source types: `loi`, `ligne_directrice`, `communique`, `decision`, `avis`, `autre`
- **Smart Query Routing**: `_detect_query_intent()` analyzes each question to detect explicit document references and legal concepts, then `_smart_retrieve()` prioritizes chunks from the correct document(s) instead of blind vector search
- To add new docs: place in `data/`, add entry to `FILENAME_METADATA` in `rag.py`, add routing rule to `QUERY_ROUTING_RULES`, delete `vector_store/`, restart

### Google Apps Script Deployment
- **Files**: `google-apps-script/Code.gs` + `google-apps-script/index.html`
- **Setup**: Create new Google Apps Script project, paste both files, set `OPENAI_API_KEY` in Script Properties, deploy as Web App
- **Model**: Uses GPT-4o directly via OpenAI API (no RAG — standalone prompt with knowledge base listing)

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

## Monafassa AI Chatbot v2 (artifacts/monafassa-v2)

Node.js/Express-powered AI legal chatbot for the Conseil de la Concurrence. Uses OpenAI Responses API with file_search (vector store) for RAG, JWT admin authentication, PostgreSQL for feedback/analytics/settings.

### Architecture
- **Frontend**: React + Vite (artifacts/monafassa-v2) — compiled static files served by API server at `/monafassa-v2/`
- **Backend**: Express routes in `artifacts/api-server/src/routes/monafassa-chat.ts` and `monafassa-admin.ts`
- **Database**: PostgreSQL tables `monafassa_feedbacks`, `monafassa_analytics`, `monafassa_settings`
- **AI**: OpenAI Responses API + file_search with vector store `vs_69e0499e7fb081919b0157d8195caed6`

### Service Routing
- The monafassa-v2 artifact serves at `/monafassa-v2/` via the shared API server (port 8080)
- The workflow `artifacts/monafassa-v2: web` is **intentionally** set to port 8080 (same as API server)
- Static files are compiled with `pnpm --filter @workspace/monafassa-v2 run build` and served via `app.ts`
- **To update after frontend changes**: rebuild with `PORT=24654 BASE_PATH=/monafassa-v2/ pnpm --filter @workspace/monafassa-v2 run build` then rebuild+restart api-server

### Admin Panel
- Accessible at `/monafassa-v2/` → admin button (top-right person icon)
- Default password: **admin123**
- Password hash stored in `ADMIN_PASSWORD_HASH` env var (bcryptjs format)
- JWT tokens expire after 8 hours

### API Endpoints (no auth required)
- `POST /api/monafassa/chat` — chat with caching
- `POST /api/monafassa/chat/stream` — SSE streaming chat
- `GET /api/monafassa/settings` — public chatbot settings (welcome message)
- `POST /api/monafassa/feedback` — submit user feedback

### Admin API Endpoints (JWT required)
- `POST /api/monafassa/admin/login` — get JWT token
- `GET /api/monafassa/admin/documents` — list vector store documents
- `POST /api/monafassa/admin/documents` — upload PDF to vector store
- `DELETE /api/monafassa/admin/documents/:fileId` — delete document
- `GET /api/monafassa/admin/feedbacks` — user feedbacks + stats
- `GET /api/monafassa/admin/analytics` — daily query analytics
- `GET/PUT /api/monafassa/admin/settings` — chatbot settings

### Environment Variables
- `OPENAI_API_KEY` — OpenAI API key (secret)
- `VECTOR_STORE_ID` — OpenAI vector store ID (`vs_69e0499e7fb081919b0157d8195caed6`)
- `JWT_SECRET` — JWT signing secret
- `ADMIN_PASSWORD_HASH` — bcryptjs hash of admin password

## Chatbot CC V 3.0 (artifacts/conseil-chatbot)

Production chatbot using Anthropic Claude AI (claude-sonnet-4-6) with custom RAG vector store (PostgreSQL-based), admin panel, and configurable appearance. Current stable version.

### Architecture
- **Frontend**: React + Vite (artifacts/conseil-chatbot) — compiled static files served by API server at `/conseil-chatbot/`
- **Backend**: Express routes in `artifacts/api-server/src/routes/conseil-chat.ts` and `conseil-admin.ts`
- **AI**: Anthropic claude-sonnet-4-6 via Replit AI Integration (`@workspace/integrations-anthropic-ai`)
- **Embeddings**: OpenAI text-embedding-3-small for vector search (cosine similarity in JavaScript)
- **Vector Store**: PostgreSQL JSONB columns storing float[] embeddings; top-K retrieval by cosine similarity

### Database Tables
- `conseil_documents` — uploaded documents metadata (name, filename, size, mime_type, active flag)
- `conseil_chunks` — text chunks with embeddings (1536-dim float array stored as JSONB)
- `conseil_feedbacks` — user feedback (question, answer, rating +1/-1, optional comment)
- `conseil_config` — bot configuration (name, greeting, colors, system prompt, max_tokens, temperature, admin_password_hash)

### Chat Features
- Streaming SSE responses from Claude claude-sonnet-4-6
- RAG: query embedded with OpenAI, top-5 chunks retrieved from active documents
- Conversation history (localStorage), grouped by date
- Voice input (Web Speech API, French)
- Markdown rendering (custom inline renderer — no extra dependencies)
- 👍/👎 feedback buttons on each response
- Sidebar with conversation history, new chat button, admin access

### Admin Panel (password-protected)
- **Documents tab**: Upload PDF/TXT → auto-parsed & chunked → embeddings generated → stored in PostgreSQL
- **Feedback tab**: View all user feedback with statistics (total, positive, negative)
- **Config tab**: Bot name, greeting, primary/secondary colors, system prompt, model params (max_tokens, temperature), admin password change
- Default admin password: **admin123** (change in admin config tab)

### API Endpoints
- `GET /api/conseil/config` — public bot config (name, greeting, colors)
- `POST /api/conseil/chat` — streaming SSE chat with RAG context
- `POST /api/conseil/feedback` — submit feedback
- `POST /api/conseil/admin/login` — JWT login
- `GET/PUT /api/conseil/admin/config` — full config management (auth required)
- `GET /api/conseil/admin/documents` — list documents (auth required)
- `POST /api/conseil/admin/documents` — upload + index document (auth required)
- `PATCH /api/conseil/admin/documents/:id` — toggle active/inactive (auth required)
- `DELETE /api/conseil/admin/documents/:id` — delete document + chunks (auth required)
- `GET /api/conseil/admin/feedbacks` — list feedbacks (auth required)

### Service Routing
- The conseil-chatbot frontend is compiled and served by the api-server at `/conseil-chatbot/`
- The `/conseil-chatbot/` path is registered in the api-server artifact.toml alongside `/api/` and `/monafassa-v2/`
- The conseil-chatbot dev workflow (vite on port 3002) is a separate workflow but the app is accessible via the api-server
- **To update after frontend changes**: `PORT=3002 BASE_PATH=/conseil-chatbot/ pnpm --filter @workspace/conseil-chatbot run build` then rebuild+restart api-server

### Environment Variables Required
- `OPENAI_API_KEY` — for text-embedding-3-small (already set)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` + `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Replit AI Integration (set via Anthropic integration)
- `SESSION_SECRET` — JWT signing (already set)
- `CONSEIL_ADMIN_PASSWORD` — (optional) default admin password override (defaults to "admin123")

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run Node.js API server locally
- `python3 artifacts/lexconc-ma/backend/main.py` — run Python RAG API server

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
