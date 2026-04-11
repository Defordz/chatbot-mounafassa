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

## LexConc-MA Artifact

A professional AI legal assistant specialized in Moroccan competition law.

### Architecture
- **Frontend**: React + Vite (artifacts/lexconc-ma) — served at `/`
- **Python RAG Backend**: FastAPI + LangChain + FAISS (artifacts/lexconc-ma/backend) — served at `/lexconc-api`

### Python Backend
- **File**: `artifacts/lexconc-ma/backend/main.py` — FastAPI app
- **RAG Engine**: `artifacts/lexconc-ma/backend/rag.py` — LangChain + FAISS vector search
- **Documents**: `artifacts/lexconc-ma/backend/documents/` — uploaded PDFs
- **Vector Store**: `artifacts/lexconc-ma/backend/vector_store/` — FAISS index (auto-generated)
- **Port**: 8765

### Python Dependencies
- `fastapi`, `uvicorn` — web server
- `langchain`, `langchain-openai`, `langchain-community`, `langchain-text-splitters` — RAG orchestration
- `faiss-cpu` — vector store
- `pypdf` — PDF parsing
- `openai` — LLM + embeddings
- **Requires**: `OPENAI_API_KEY` environment secret

### Internal Knowledge Base
- Place PDF files in `artifacts/lexconc-ma/backend/data/` — they are auto-indexed at startup
- Expected filenames (auto-detect metadata): `loi_104_12.pdf`, `loi_20_13.pdf`, `guidelines_concentration.pdf`, `autres_guidelines.pdf`, `communiques.pdf`
- Users cannot upload or delete documents — the knowledge base is private and controlled by the administrator

### Key API Endpoints (all under /lexconc-api/api/)
- `GET /health` — health check (includes indexing status)
- `POST /chat` — RAG-powered Q&A
- `GET /stats` — index statistics

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run Node.js API server locally
- `python3 artifacts/lexconc-ma/backend/main.py` — run Python RAG API server

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
