import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, ChevronDown, CheckSquare, Square, FileText } from 'lucide-react';

export default function DocumentSelector({ documents, selectedDocs, setSelectedDocs }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

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
    if (documents.length === 0) return 'No papers indexed';
    if (selectedDocs.length === 0 || selectedDocs.length === documents.length) {
      return `Scoped: All (${documents.length})`;
    }
    return `Scoped: ${selectedDocs.length} of ${documents.length}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/40 text-[11.5px] text-zinc-300 hover:text-zinc-100 transition-all cursor-pointer font-sans"
      >
        <FileText className="h-3 w-3 text-amber-400" />
        <span className="font-medium">{getScopeLabel()}</span>
        <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform duration-150 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />
      </button>

      {/* Dropdown Floating Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-zinc-900/98 border border-zinc-800 rounded-xl p-2.5 shadow-2xl z-50 space-y-1.5 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 text-[10.5px] text-zinc-400 font-mono">
            <span className="font-semibold uppercase tracking-wider text-zinc-400">Filter Active Scope</span>
            {documents.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                {selectedDocs.length === documents.length || selectedDocs.length === 0 ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
            {documents.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3 text-center">No PDFs indexed in this workspace.</p>
            ) : (
              documents.map((doc) => {
                const isSelected = selectedDocs.length === 0 || selectedDocs.includes(doc.doc_name);
                return (
                  <div
                    key={doc.doc_name}
                    onClick={() => toggleDoc(doc.doc_name)}
                    className={`flex items-center gap-2 p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-500/10 text-zinc-100 font-medium border border-amber-500/20'
                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                    )}
                    <span className="truncate flex-1 text-[11.5px]">{doc.doc_name}</span>
                    <span className="text-[9.5px] font-mono text-zinc-500">{doc.chunk_count}c</span>
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