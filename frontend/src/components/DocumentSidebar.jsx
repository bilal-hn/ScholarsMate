import React, { useState } from 'react';
import { FileText, Plus, CheckSquare, Square, RefreshCw, AlertCircle } from 'lucide-react';
import { uploadFile } from '../services/api';

export default function DocumentSidebar({ documents, selectedDocs, setSelectedDocs, refreshDocs, loadingDocs }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const toggleDoc = (docName) => {
    if (selectedDocs.includes(docName)) {
      setSelectedDocs(selectedDocs.filter((name) => name !== docName));
    } else {
      setSelectedDocs([...selectedDocs, docName]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedDocs.length === documents.length) {
      setSelectedDocs([]);
    } else {
      setSelectedDocs(documents.map((d) => d.doc_name));
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      await uploadFile(file);
      await refreshDocs();
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Failed to upload document.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <aside className="w-80 bg-zinc-950 border-r border-zinc-800/80 flex flex-col h-full shrink-0 select-none">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-amber-400" />
          <h2 className="font-semibold text-zinc-100 text-sm tracking-wide">Workspace Library</h2>
        </div>
        <button
          onClick={refreshDocs}
          title="Refresh Library"
          className="text-zinc-400 hover:text-amber-400 p-1.5 rounded-lg hover:bg-zinc-900 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loadingDocs ? 'animate-spin text-amber-400' : ''}`} />
        </button>
      </div>

      {/* Upload PDF Box */}
      <div className="p-4 border-b border-zinc-800/80">
        <label className="flex items-center justify-center gap-2 w-full border border-dashed border-zinc-700 hover:border-amber-400/80 rounded-xl p-3 cursor-pointer bg-zinc-900/40 hover:bg-amber-500/5 transition-all group">
          <Plus className="h-4 w-4 text-amber-400 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-medium text-zinc-200">
            {uploading ? 'Processing PDF...' : 'Add PDF Document'}
          </span>
          <input
            type="file"
            accept=".pdf"
            disabled={uploading}
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
        {uploadError && (
          <div className="mt-2 text-xs text-rose-400 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* Document Selection Catalog */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-3 px-1">
          <span className="font-mono text-[11px] text-zinc-500">{documents.length} File(s) Indexed</span>
          {documents.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="text-amber-400 hover:underline font-medium text-[11px]"
            >
              {selectedDocs.length === documents.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-10 text-xs text-zinc-600">
            No documents in workspace.<br />Upload a PDF to get started.
          </div>
        ) : (
          documents.map((doc) => {
            const isSelected = selectedDocs.includes(doc.doc_name);
            return (
              <div
                key={doc.doc_name}
                onClick={() => toggleDoc(doc.doc_name)}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/40 text-zinc-100 shadow-sm'
                    : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                <button className="mt-0.5 text-amber-400 shrink-0">
                  {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-zinc-700" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate leading-tight">{doc.doc_name}</p>
                  <p className="text-[10px] font-mono text-zinc-500 mt-1">{doc.chunk_count} text chunks</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}