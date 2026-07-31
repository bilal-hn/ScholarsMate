import React, { useState, useRef } from 'react';
import { Upload, FolderPlus, FileText, Loader2, X, AlertCircle } from 'lucide-react';
import { createWorkspace } from '../services/api';

export default function CreateWorkspaceModal({ isOpen, onClose, onWorkspaceCreated }) {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;

    // Filter only PDF files (using correct JavaScript .endsWith)
    const selected = Array.from(e.target.files).filter((f) =>
      f.name.toLowerCase().endsWith('.pdf')
    );

    if (selected.length === 0) {
      setError('No PDF files found in the selection.');
      setFiles([]);
    } else {
      setFiles(selected);
      setError(null);
    }
  };

  const handleStartProcessing = async () => {
    if (files.length === 0) {
      setError('Please select at least one PDF paper or folder.');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      await createWorkspace(files);
      await onWorkspaceCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to index papers into workspace.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={processing}
          className="absolute top-5 right-5 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-bold text-zinc-100 mb-1">Create Research Workspace</h3>
        <p className="text-xs text-zinc-400 mb-6">
          Select research papers or an entire folder to parse and embed into ChromaDB.
        </p>

        {/* Action Buttons: Pick Files or Pick Folder */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            disabled={processing}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-amber-400/60 hover:bg-amber-500/5 transition-all group cursor-pointer"
          >
            <Upload className="h-6 w-6 text-amber-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-zinc-200">Select PDFs</span>
          </button>

          <button
            type="button"
            disabled={processing}
            onClick={() => folderInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-amber-400/60 hover:bg-amber-500/5 transition-all group cursor-pointer"
          >
            <FolderPlus className="h-6 w-6 text-amber-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-zinc-200">Select Folder</span>
          </button>

          {/* Hidden HTML Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Selected File List Preview */}
        {files.length > 0 && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 mb-6 max-h-36 overflow-y-auto space-y-1.5">
            <span className="text-[11px] font-semibold text-amber-400 block mb-1">
              {files.length} Document(s) Ready to Index:
            </span>
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-300 truncate">
                <FileText className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 text-xs text-rose-400 flex items-center gap-1.5 bg-rose-950/30 border border-rose-900/50 p-3 rounded-xl">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Action */}
        <button
          onClick={handleStartProcessing}
          disabled={processing || files.length === 0}
          className="w-full bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Parsing Layout & Generating Embeddings...</span>
            </>
          ) : (
            <span>Process & Start Chat</span>
          )}
        </button>
      </div>
    </div>
  );
}