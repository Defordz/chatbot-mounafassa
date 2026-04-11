import React, { useState, useRef } from "react";
import { Upload, Trash2, FileText, AlertCircle, CheckCircle, Loader2, X } from "lucide-react";
import type { Document } from "@/lib/api";
import { uploadDocument, deleteDocument, SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS } from "@/lib/api";

const SOURCE_TYPE_OPTIONS = [
  { value: "loi", label: "Loi" },
  { value: "ligne_directrice", label: "Ligne directrice" },
  { value: "communique", label: "Communiqué officiel" },
  { value: "decision", label: "Décision" },
  { value: "autre", label: "Autre" },
];

interface Props {
  documents: Document[];
  onDocumentsChange: () => void;
}

interface UploadState {
  file: File | null;
  sourceType: string;
  sourceName: string;
  loading: boolean;
  error: string | null;
  success: string | null;
}

export default function DocumentPanel({ documents, onDocumentsChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    sourceType: "loi",
    sourceName: "",
    loading: false,
    error: null,
    success: null,
  });

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadState((s) => ({ ...s, error: "Seuls les fichiers PDF sont acceptés", file: null }));
      return;
    }
    const nameWithoutExt = file.name.replace(/\.pdf$/i, "").replace(/_/g, " ");
    setUploadState((s) => ({
      ...s,
      file,
      sourceName: nameWithoutExt,
      error: null,
      success: null,
    }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleUpload = async () => {
    if (!uploadState.file) return;
    setUploadState((s) => ({ ...s, loading: true, error: null, success: null }));
    try {
      const result = await uploadDocument(
        uploadState.file,
        uploadState.sourceType,
        uploadState.sourceName || uploadState.file.name
      );
      setUploadState((s) => ({
        ...s,
        loading: false,
        success: result.message,
        file: null,
        sourceName: "",
      }));
      onDocumentsChange();
    } catch (err: any) {
      setUploadState((s) => ({ ...s, loading: false, error: err.message }));
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Supprimer "${filename}" ? La base vectorielle sera reconstruite.`)) return;
    setDeletingFile(filename);
    try {
      await deleteDocument(filename);
      onDocumentsChange();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeletingFile(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-sidebar-border">
        <h2 className="text-sm font-semibold text-sidebar-foreground/90 uppercase tracking-wide mb-3">
          Documents juridiques
        </h2>

        {uploadState.success && (
          <div className="mb-3 flex items-start gap-2 bg-green-500/10 text-green-400 border border-green-500/20 rounded p-2.5 text-xs">
            <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{uploadState.success}</span>
            <button onClick={() => setUploadState(s => ({ ...s, success: null }))} className="ml-auto">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {uploadState.error && (
          <div className="mb-3 flex items-start gap-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded p-2.5 text-xs">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{uploadState.error}</span>
            <button onClick={() => setUploadState(s => ({ ...s, error: null }))} className="ml-auto">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploadState.file && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors text-center ${
            dragOver
              ? "border-primary/60 bg-primary/10"
              : uploadState.file
              ? "border-green-500/40 bg-green-500/10"
              : "border-sidebar-border/60 hover:border-sidebar-primary/50 hover:bg-sidebar-accent/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />
          {uploadState.file ? (
            <div className="text-xs text-green-400">
              <FileText className="w-5 h-5 mx-auto mb-1" />
              <div className="font-medium truncate">{uploadState.file.name}</div>
              <div className="text-sidebar-foreground/40 mt-0.5">
                {(uploadState.file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          ) : (
            <div className="text-xs text-sidebar-foreground/50">
              <Upload className="w-5 h-5 mx-auto mb-1" />
              <div>Déposer un PDF ou cliquer</div>
            </div>
          )}
        </div>

        {uploadState.file && (
          <div className="mt-2.5 space-y-2">
            <div>
              <label className="text-xs text-sidebar-foreground/60 block mb-1">Type de document</label>
              <select
                value={uploadState.sourceType}
                onChange={(e) => setUploadState((s) => ({ ...s, sourceType: e.target.value }))}
                className="w-full text-xs bg-sidebar-accent border border-sidebar-border rounded px-2 py-1.5 text-sidebar-foreground"
              >
                {SOURCE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-sidebar-foreground/60 block mb-1">Nom de la source</label>
              <input
                type="text"
                value={uploadState.sourceName}
                onChange={(e) => setUploadState((s) => ({ ...s, sourceName: e.target.value }))}
                placeholder="Ex: Loi 104-12"
                className="w-full text-xs bg-sidebar-accent border border-sidebar-border rounded px-2 py-1.5 text-sidebar-foreground placeholder:text-sidebar-foreground/30"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpload}
                disabled={uploadState.loading}
                className="flex-1 bg-primary text-primary-foreground text-xs py-1.5 rounded hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {uploadState.loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Traitement...</>
                ) : (
                  <><Upload className="w-3.5 h-3.5" /> Importer</>
                )}
              </button>
              <button
                onClick={() => setUploadState(s => ({ ...s, file: null, sourceName: "", error: null }))}
                className="px-3 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground border border-sidebar-border rounded"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {documents.length === 0 ? (
          <div className="text-center py-8 text-sidebar-foreground/40 text-xs">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div>Aucun document chargé</div>
            <div className="mt-1 opacity-70">Importez les textes juridiques ci-dessus</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {documents.map((doc) => (
              <div
                key={doc.filename}
                className="group flex items-start gap-2 p-2.5 rounded-lg bg-sidebar-accent/50 hover:bg-sidebar-accent border border-sidebar-border/50 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 mt-0.5 text-sidebar-foreground/40 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-sidebar-foreground/80 truncate">
                    {doc.source_name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SOURCE_TYPE_COLORS[doc.source_type] || SOURCE_TYPE_COLORS.autre}`}>
                      {SOURCE_TYPE_LABELS[doc.source_type] || "Autre"}
                    </span>
                    <span className="text-[10px] text-sidebar-foreground/40">
                      {doc.chunks} segments · {doc.pages} p.
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.filename)}
                  disabled={deletingFile === doc.filename}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300"
                >
                  {deletingFile === doc.filename ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
