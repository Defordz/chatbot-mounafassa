import os
import asyncio
import traceback
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

from rag import LexConcRAG

app = FastAPI(title="LexConc-MA API")

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


@router.post("/chat")
async def chat(request: ChatRequest):
    try:
        rag = get_rag()

        if rag is None:
            msg = rag_error or "Le système RAG est en cours d'initialisation. Veuillez réessayer dans quelques instants."
            return JSONResponse(
                status_code=503,
                content={
                    "error": msg,
                    "type": "rag_not_ready",
                    "answer": f"Le système n'est pas encore prêt : {msg}",
                    "sources": [],
                    "confidence_score": 0.0,
                    "retrieved_chunks": [],
                },
            )

        if not rag.has_documents():
            return JSONResponse(
                content={
                    "answer": "La base de connaissances juridiques n'est pas encore disponible. Les documents sont en cours d'indexation ou n'ont pas pu être chargés.",
                    "sources": [],
                    "confidence_score": 0.0,
                    "retrieved_chunks": [],
                }
            )

        result = await asyncio.to_thread(
            rag.query,
            request.question,
            request.conversation_history,
            request.source_filter,
        )
        # Return via JSONResponse to avoid FastAPI's encoder touching numpy types
        return JSONResponse(content=result)

    except Exception as e:
        err_str = str(e)
        traceback.print_exc()

        # OpenAI-specific errors
        if "insufficient_quota" in err_str or "429" in err_str:
            return JSONResponse(
                status_code=402,
                content={
                    "error": "Quota OpenAI dépassé. Veuillez recharger votre compte sur platform.openai.com.",
                    "type": "quota_exceeded",
                    "answer": "Le service est temporairement indisponible : quota OpenAI dépassé. Veuillez contacter l'administrateur.",
                    "sources": [],
                    "confidence_score": 0.0,
                    "retrieved_chunks": [],
                },
            )

        if "invalid_api_key" in err_str or "Incorrect API key" in err_str or "401" in err_str:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "Clé API OpenAI invalide.",
                    "type": "invalid_api_key",
                    "answer": "Erreur de configuration : clé API invalide. Veuillez contacter l'administrateur.",
                    "sources": [],
                    "confidence_score": 0.0,
                    "retrieved_chunks": [],
                },
            )

        if "timeout" in err_str.lower() or "timed out" in err_str.lower():
            return JSONResponse(
                status_code=504,
                content={
                    "error": "Délai d'attente dépassé.",
                    "type": "timeout",
                    "answer": "La requête a pris trop de temps. Veuillez réessayer.",
                    "sources": [],
                    "confidence_score": 0.0,
                    "retrieved_chunks": [],
                },
            )

        # Generic error
        return JSONResponse(
            status_code=500,
            content={
                "error": err_str,
                "type": "internal_error",
                "answer": f"Une erreur interne s'est produite : {err_str}",
                "sources": [],
                "confidence_score": 0.0,
                "retrieved_chunks": [],
            },
        )


@router.get("/stats")
async def get_stats():
    try:
        rag = get_rag()
        if rag is None:
            return JSONResponse(
                status_code=503,
                content={"error": rag_error or "RAG not ready", "type": "rag_not_ready"},
            )
        return rag.get_stats()
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "type": "internal_error"},
        )


app.include_router(router)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
