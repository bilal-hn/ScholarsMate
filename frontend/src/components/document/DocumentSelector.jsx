import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, ChevronDown, CheckSquare, Square } from 'lucide-react';

export default function DocumentSelector({ documents, selectedDocs, setSelectedDocs }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const getScopeLabel = () => {
    if (documents.length === 0) return 'No documents loaded';
    if (selectedDocs.length === 0 || selectedDocs.length === documents.length) {
      return `Documents Selected: All (${documents.length})`;
    }
    return `Documents Selected: ${selectedDocs.length} of ${documents.length}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-amber-400/60 text-xs text-zinc-200 transition-all cursor-pointer"
      >
        <BookOpen className="h-3.5 w-3.5 text-amber-400" />
        <span className="font-medium">{getScopeLabel()}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />
      </button>

      {/* Dropdown Floating Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-2xl z-50 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-300 uppercase tracking-wider">Select Target Scope</span>
            {documents.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="text-amber-400 hover:underline font-medium cursor-pointer"
              >
                {selectedDocs.length === documents.length || selectedDocs.length === 0 ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {documents.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3 text-center">No PDFs indexed in workspace.</p>
            ) : (
              documents.map((doc) => {
                const isSelected = selectedDocs.length === 0 || selectedDocs.includes(doc.doc_name);
                return (
                  <div
                    key={doc.doc_name}
                    onClick={() => toggleDoc(doc.doc_name)}
                    className={`flex items-center gap-2.5 p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-500/10 text-zinc-100 font-medium border border-amber-500/20'
                        : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-amber-400 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-zinc-700 shrink-0" />
                    )}
                    <span className="truncate flex-1">{doc.doc_name}</span>
                    <span className="text-[10px] font-mono text-zinc-500">{doc.chunk_count} chunks</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}