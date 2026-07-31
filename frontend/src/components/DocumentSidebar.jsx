import React, { useState } from 'react';
import { FileText, Upload, CheckSquare, Square, RefreshCw, AlertCircle } from 'lucide-react';
import { uploadFile } from '../services/api';

export default function DocumentSidebar({ documents, selectedDocs, setSelectedDocs, refreshDocs, loadingDocs }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Toggle selection of a document for query scoping
  const toggleDoc = (docName) => {
    if (selectedDocs.includes(docName)) {
      setSelectedDocs(selectedDocs.filter((name) => name !== docName));
    } else {
      setSelectedDocs([...selectedDocs, docName]);
    }
  };

  // Toggle select all / clear all
  const toggleSelectAll = () => {
    if (selectedDocs.length === documents.length) {
      setSelectedDocs([]);
    } else {
      setSelectedDocs(documents.map((d) => d.doc_name));
    }
  };

  // Handle PDF file upload
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
      await refreshDocs(); // Refresh list after successful upload
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Failed to upload document.');
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  return (
    <aside className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-sky-400" />
          <h2 className="font-semibold text-slate-100">Document Library</h2>
        </div>
        <button
          onClick={refreshDocs}
          title="Refresh Library"
          className="text-slate-400 hover:text-sky-400 p-1 rounded-lg transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loadingDocs ? 'animate-spin text-sky-400' : ''}`} />
        </button>
      </div>

      {/* Upload Box */}
      <div className="p-4 border-b border-slate-800">
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-sky-500 rounded-xl p-4 cursor-pointer bg-slate-900/50 transition-colors group">
          <Upload className="h-6 w-6 text-slate-400 group-hover:text-sky-400 mb-2 transition-colors" />
          <span className="text-xs font-medium text-slate-300">
            {uploading ? 'Processing PDF...' : 'Upload PDF Document'}
          </span>
          <span className="text-[10px] text-slate-500 mt-1">Click to select file</span>
          <input
            type="file"
            accept=".pdf"
            disabled={uploading}
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
        {uploadError && (
          <div className="mt-2 text-xs text-rose-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* Document Selection List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-3 px-1">
          <span>{documents.length} File(s) Indexed</span>
          {documents.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="text-sky-400 hover:underline font-medium"
            >
              {selectedDocs.length === documents.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
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
                    ? 'bg-sky-950/40 border-sky-500/50 text-slate-100'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <button className="mt-0.5 text-sky-400 shrink-0">
                  {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-slate-600" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate leading-tight">{doc.doc_name}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{doc.chunk_count} text chunks</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}