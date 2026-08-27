import React, { useState, useRef } from 'react';
import { Upload, FolderPlus, FileText, Loader2, X, AlertCircle } from 'lucide-react';
import { createWorkspace } from '../../services/api';

export default function CreateWorkspaceModal({ isOpen, onClose, onWorkspaceCreated }) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (!e.target.files || e.target.files.length === 0) return;

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
      const response = await createWorkspace(files);

      if (onWorkspaceCreated) {
        await onWorkspaceCreated({
          id: response.session_id,
          name: workspaceName.trim() || response.title,
          documents: response.doc_names || files.map((f) => f.name),
          createdAt: new Date().toISOString(),
        });
      }

      setWorkspaceName('');
      setFiles([]);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to index papers into workspace.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 shadow-2xl relative text-zinc-100">
        <button
          type="button"
          onClick={onClose}
          disabled={processing}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-base font-bold text-zinc-100 mb-0.5">Create Research Workspace</h3>
        <p className="text-xs text-zinc-400 mb-4">
          Upload PDF research papers or a directory to index into your workspace.
        </p>

        {/* Optional Workspace Name Input */}
        <div className="mb-4">
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
            Workspace Title <span className="text-zinc-600 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Sonar Recognition Survey"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            disabled={processing}
            className="w-full bg-zinc-950/70 border border-zinc-800 focus:border-amber-500/80 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors"
          />
        </div>

        {/* File / Folder Select Buttons */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <button
            type="button"
            disabled={processing}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/90 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group cursor-pointer"
          >
            <Upload className="h-4 w-4 text-amber-500 group-hover:scale-105 transition-transform" />
            <span className="text-xs font-medium text-zinc-200">Select PDFs</span>
          </button>

          <button
            type="button"
            disabled={processing}
            onClick={() => folderInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/90 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group cursor-pointer"
          >
            <FolderPlus className="h-4 w-4 text-amber-500 group-hover:scale-105 transition-transform" />
            <span className="text-xs font-medium text-zinc-200">Select Folder</span>
          </button>

          <input ref={fileInputRef} type="file" multiple accept=".pdf" onChange={handleFileChange} className="hidden" />
          <input ref={folderInputRef} type="file" webkitdirectory="" directory="" onChange={handleFileChange} className="hidden" />
        </div>

        {/* Selected Files Preview */}
        {files.length > 0 && (
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-2.5 mb-4 max-h-28 overflow-y-auto space-y-1">
            <span className="text-[10px] font-semibold text-amber-400 block mb-0.5 font-mono">
              {files.length} Document(s) Ready:
            </span>
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-zinc-300 truncate font-mono text-[11px]">
                <FileText className="h-3 w-3 text-zinc-500 shrink-0" />
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-3 text-xs text-rose-400 flex items-center gap-1.5 bg-rose-950/30 border border-rose-900/50 p-2.5 rounded-xl">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleStartProcessing}
          disabled={processing || files.length === 0}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer text-xs"
        >
          {processing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Indexing Papers...</span>
            </>
          ) : (
            <span>Start Research Workspace</span>
          )}
        </button>
      </div>
    </div>
  );
}