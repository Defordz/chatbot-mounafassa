import os
import asyncio
import traceback
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

from rag import LexConcRAG

app = FastAPI(title="LexConc-MA API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

VECTOR_STORE_DIR = Path(__file__).parent / "vector_store"
VECTOR_STORE_DIR.mkdir(exist_ok=True)

rag_instance: Optional[LexConcRAG] = None
rag_error: Optional[str] = None


def get_rag() -> Optional[LexConcRAG]:
    return rag_instance


@app.on_event("startup")
async def startup_event():
    global rag_instance, rag_error
    try:
        print("[Startup] Initializing RAG system...")
        rag_instance = await asyncio.to_thread(
            LexConcRAG,
            str(DATA_DIR),
            str(VECTOR_STORE_DIR),
        )
        print("[Startup] RAG system ready.")
    except Exception as e:
        rag_error = str(e)
        print(f"[Startup ERROR] RAG initialization failed: {e}")
        traceback.print_exc()


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[Unhandled Error] {request.url}: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={
            "error": str(exc),
            "type": "internal_error",
        },
    )


class ChatRequest(BaseModel):
    question: str
    conversation_history: list = []
    source_filter: Optional[str] = None
    include_warnings: bool = True


router = APIRouter(prefix="/lexconc-api/api")


@router.get("/health")
async def health():
    try:
        rag = get_rag()
        if rag is None:
            return JSONResponse(
                status_code=503,
                content={
                    "status": "initializing",
                    "error": rag_error,
                    "documents_indexed": False,
                    "total_chunks": 0,
                },
            )
        return {
            "status": "ok",
            "documents_indexed": rag.has_documents(),
            "total_chunks": rag.get_stats().get("total_chunks", 0),
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error": str(e), "type": "internal_error"},
        )


@router.get("/config")
async def get_config():
    """Expose non-sensitive runtime config for ops dashboards."""
    rag = get_rag()
    if rag is None:
        return JSONResponse(status_code=503, content={"error": rag_error or "RAG not ready"})
    try:
        return {
            "total_documents": rag.get_stats().get("total_documents", 0),
            "total_chunks": rag.get_stats().get("total_chunks", 0),
            "has_vector_store": rag.get_stats().get("has_vector_store", False),
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/chat")
async def chat(request: ChatRequest):
    try:
        rag = get_rag()

        if rag is None:
            return JSONResponse(
                status_code=503,
                content={
                    "error": rag_error or "RAG not ready",
                    "answer": "Le système n'est pas prêt.",
                    "sources": [],
                    "confidence_score": 0.0,
                    "retrieved_chunks": [],
                },
            )

        result = await asyncio.to_thread(
            rag.query,
            request.question,
            request.conversation_history,
            request.source_filter,
        )

        return JSONResponse(content=result)

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "answer": f"Erreur interne: {str(e)}",
                "sources": [],
                "confidence_score": 0.0,
                "retrieved_chunks": [],
            },
        )


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    import json as _json

    rag = get_rag()

    async def stream_gen():
        import queue
        import threading

        q = queue.Queue()

        def _run():
            try:
                for event in rag.query_stream(
                    request.question,
                    request.conversation_history,
                    request.source_filter,
                ):
                    q.put(event)
                q.put(None)
            except Exception as e:
                q.put({"type": "error", "content": str(e)})
                q.put(None)

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        while True:
            event = await asyncio.to_thread(q.get)
            if event is None:
                break
            yield f"data: {_json.dumps(event, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_gen(), media_type="text/event-stream")


@router.get("/stats")
async def get_stats():
    rag = get_rag()
    if rag is None:
        return JSONResponse(status_code=503, content={"error": rag_error or "RAG not ready"})
    return rag.get_stats()


app.include_router(router)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    uvicorn.run("main:app", host="0.0.0.0", port=port)