import os
import asyncio
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, APIRouter
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


def get_rag() -> LexConcRAG:
    global rag_instance
    if rag_instance is None:
        rag_instance = LexConcRAG(
            data_dir=str(DATA_DIR),
            vector_store_dir=str(VECTOR_STORE_DIR),
        )
    return rag_instance


@app.on_event("startup")
async def startup_event():
    await asyncio.to_thread(get_rag)


class ChatRequest(BaseModel):
    question: str
    conversation_history: list = []
    source_filter: Optional[str] = None


router = APIRouter(prefix="/lexconc-api/api")


@router.get("/health")
async def health():
    rag = get_rag()
    return {
        "status": "ok",
        "documents_indexed": rag.has_documents(),
        "total_chunks": rag.get_stats().get("total_chunks", 0),
    }


@router.post("/chat")
async def chat(request: ChatRequest):
    rag = get_rag()

    if not rag.has_documents():
        return JSONResponse(
            content={
                "answer": "La base de connaissances juridiques n'est pas encore disponible. Veuillez contacter l'administrateur pour charger les textes officiels.",
                "sources": [],
                "confidence_score": 0.0,
                "retrieved_chunks": [],
            }
        )

    try:
        result = await asyncio.to_thread(
            rag.query,
            request.question,
            request.conversation_history,
            request.source_filter,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de traitement : {str(e)}")


@router.get("/stats")
async def get_stats():
    rag = get_rag()
    return rag.get_stats()


app.include_router(router)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
