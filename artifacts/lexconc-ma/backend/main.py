import os
import json
import asyncio
import shutil
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, APIRouter
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

DOCUMENTS_DIR = Path(__file__).parent / "documents"
DOCUMENTS_DIR.mkdir(exist_ok=True)

VECTOR_STORE_DIR = Path(__file__).parent / "vector_store"

rag_instance: Optional[LexConcRAG] = None

def get_rag() -> LexConcRAG:
    global rag_instance
    if rag_instance is None:
        rag_instance = LexConcRAG(
            documents_dir=str(DOCUMENTS_DIR),
            vector_store_dir=str(VECTOR_STORE_DIR),
        )
    return rag_instance


class ChatRequest(BaseModel):
    question: str
    conversation_history: list = []
    source_filter: Optional[str] = None


router = APIRouter(prefix="/lexconc-api/api")


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/documents")
async def list_documents():
    rag = get_rag()
    docs = rag.list_documents()
    return {"documents": docs}


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    source_type: str = Form("loi"),
    source_name: str = Form(""),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    safe_name = file.filename.replace(" ", "_")
    dest_path = DOCUMENTS_DIR / safe_name

    with open(dest_path, "wb") as f:
        content = await file.read()
        f.write(content)

    metadata = {
        "source_type": source_type,
        "source_name": source_name or safe_name,
        "filename": safe_name,
    }

    meta_path = DOCUMENTS_DIR / f"{safe_name}.meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    rag = get_rag()
    try:
        chunks_added = rag.ingest_document(str(dest_path), metadata)
        return {
            "success": True,
            "filename": safe_name,
            "chunks_added": chunks_added,
            "message": f"Document ingéré avec succès : {chunks_added} segments créés",
        }
    except Exception as e:
        os.remove(dest_path)
        if meta_path.exists():
            os.remove(meta_path)
        raise HTTPException(status_code=500, detail=f"Erreur d'ingestion : {str(e)}")


@router.delete("/documents/{filename}")
async def delete_document(filename: str):
    global rag_instance
    file_path = DOCUMENTS_DIR / filename
    meta_path = DOCUMENTS_DIR / f"{filename}.meta.json"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document non trouvé")

    file_path.unlink()
    if meta_path.exists():
        meta_path.unlink()

    rag_instance = None
    if VECTOR_STORE_DIR.exists():
        shutil.rmtree(VECTOR_STORE_DIR)

    rag = get_rag()
    for pdf in DOCUMENTS_DIR.glob("*.pdf"):
        meta_file = DOCUMENTS_DIR / f"{pdf.name}.meta.json"
        metadata = {}
        if meta_file.exists():
            with open(meta_file, encoding="utf-8") as f:
                metadata = json.load(f)
        try:
            rag.ingest_document(str(pdf), metadata)
        except Exception:
            pass

    return {"success": True, "message": f"Document '{filename}' supprimé"}


@router.post("/chat")
async def chat(request: ChatRequest):
    rag = get_rag()

    if not rag.has_documents():
        return JSONResponse(
            content={
                "answer": "Aucun document n'a été chargé. Veuillez d'abord télécharger les textes juridiques (Loi 104-12, Loi 20-13, Lignes directrices, etc.) via le panneau 'Documents'.",
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
