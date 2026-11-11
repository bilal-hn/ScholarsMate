import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  BookOpen,
  Search,
  Check,
  Quote,
  FileText,
  ExternalLink,
  Loader2,
  Sparkles,
  Layers,
  Folder,
} from 'lucide-react';
import { getLibraryAPI } from '../../services/api';

/**
 * Format helper for in-text author string (e.g. "Vaswani et al." or "Smith & Jones")
 */
function formatInTextAuthor(authorsStr) {
  if (!authorsStr) return 'Anon';
  // Split by ';' or 'and' or ','
  const parts = authorsStr.split(/[;]| and /i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return 'Anon';

  const getLastName = (fullName) => {
    // If "Last, First"
    if (fullName.includes(',')) {
      return fullName.split(',')[0].trim();
    }
    // If "First Last"
    const words = fullName.split(/\s+/);
    return words[words.length - 1];
  };

  const firstLast = getLastName(parts[0]);
  if (parts.length === 1) {
    return firstLast;
  }
  if (parts.length === 2) {
    return `${firstLast} & ${getLastName(parts[1])}`;
  }
  return `${firstLast} et al.`;
}

export default function LibraryCitationDrawer({
  isOpen,
  onClose,
  onInsertCitation,
  existingCitations = [],
  workspaceDocs = [],
  onOpenPdfViewer,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'workspace'
  const [citationStyle, setCitationStyle] = useState('ieee'); // 'ieee' | 'apa' | 'harvard'
  const [pageInputs, setPageInputs] = useState({});

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getLibraryAPI()
        .then((data) => {
          setItems(data.items || []);
        })
        .catch((err) => console.error('Failed to load library papers in writer:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  // Compute filtered items
  const filteredItems = useMemo(() => {
    let result = items;

    if (filterMode === 'workspace' && workspaceDocs.length > 0) {
      const wsDocSet = new Set(workspaceDocs.map((d) => (typeof d === 'string' ? d : d.doc_name)));
      result = result.filter((item) => wsDocSet.has(item.doc_name));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => {
        return (
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.authors && item.authors.toLowerCase().includes(q)) ||
          (item.venue && item.venue.toLowerCase().includes(q)) ||
          (item.doc_name && item.doc_name.toLowerCase().includes(q)) ||
          (item.doi && item.doi.toLowerCase().includes(q)) ||
          (item.arxiv_id && item.arxiv_id.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [items, filterMode, searchQuery, workspaceDocs]);

  if (!isOpen) return null;

  const handlePageChange = (docId, val) => {
    setPageInputs((prev) => ({ ...prev, [docId]: val }));
  };

  const handleInsert = (paper) => {
    const pageNum = pageInputs[paper.id]?.trim() || null;
    if (onInsertCitation) {
      onInsertCitation(paper, citationStyle, pageNum);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-zinc-950/98 border-l border-zinc-800 shadow-2xl backdrop-blur-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200 select-text">
      {/* 1. Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Insert Citation</h3>
            <p className="text-[11px] text-zinc-400">Search academic library & cite into manuscript</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Citation Style Selector */}
      <div className="p-3 bg-zinc-900/70 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Style:</span>
        <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => setCitationStyle('ieee')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              citationStyle === 'ieee'
                ? 'bg-amber-500 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            IEEE [1]
          </button>
          <button
            type="button"
            onClick={() => setCitationStyle('apa')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              citationStyle === 'apa'
                ? 'bg-amber-500 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            APA (Author, Year)
          </button>
          <button
            type="button"
            onClick={() => setCitationStyle('harvard')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
              citationStyle === 'harvard'
                ? 'bg-amber-500 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Harvard
          </button>
        </div>
      </div>

      {/* 3. Search & Scope Filter Bar */}
      <div className="p-3 bg-zinc-900/40 border-b border-zinc-800 space-y-2.5 shrink-0">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, authors, venue, or DOI..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/70"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              filterMode === 'all'
                ? 'bg-zinc-800 text-amber-400 font-medium border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Papers ({items.length})
          </button>
          {workspaceDocs.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterMode('workspace')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                filterMode === 'workspace'
                  ? 'bg-zinc-800 text-amber-400 font-medium border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Current Workspace ({workspaceDocs.length})
            </button>
          )}
        </div>
      </div>

      {/* 4. Papers List Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-400 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <p className="text-xs">Loading reference library...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-zinc-500 gap-2">
            <BookOpen className="h-8 w-8 text-zinc-700" />
            <p className="text-xs font-medium text-zinc-400">No matching library documents.</p>
            <p className="text-[11px] text-zinc-600 max-w-xs">
              Upload papers or add them by DOI / arXiv in your Reference Library.
            </p>
          </div>
        ) : (
          filteredItems.map((paper) => {
            const authorShort = formatInTextAuthor(paper.authors);
            const yearStr = paper.year || 'n.d.';
            const isAlreadyCited = existingCitations.some((c) => c.doc_name === paper.doc_name);
            const citedEntry = existingCitations.find((c) => c.doc_name === paper.doc_name);

            // Preview In-Text Citation
            let inTextPreview = '';
            if (citationStyle === 'ieee') {
              inTextPreview = `[${citedEntry?.doc_index || '#'}]`;
            } else if (citationStyle === 'apa') {
              inTextPreview = `(${authorShort}, ${yearStr})`;
            } else {
              inTextPreview = `(${authorShort} ${yearStr})`;
            }

            return (
              <div
                key={paper.id}
                className="p-3 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 rounded-xl transition-all flex flex-col gap-2 group shadow-sm"
              >
                {/* Paper Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-2">
                      {paper.title || paper.doc_name}
                    </h4>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {paper.authors || 'Unknown Authors'}
                    </p>
                  </div>
                  {isAlreadyCited && (
                    <span className="text-[9.5px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono shrink-0">
                      Cited [#{citedEntry?.doc_index}]
                    </span>
                  )}
                </div>

                {/* Venue & Metadata Badges */}
                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                  {paper.year && (
                    <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.2 rounded font-mono">
                      {paper.year}
                    </span>
                  )}
                  {paper.venue && (
                    <span className="bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded truncate max-w-[170px]" title={paper.venue}>
                      {paper.venue}
                    </span>
                  )}
                  {paper.doi && (
                    <span className="text-blue-400 font-mono text-[9px] bg-blue-500/10 px-1 rounded">
                      DOI
                    </span>
                  )}
                  {paper.arxiv_id && (
                    <span className="text-red-400 font-mono text-[9px] bg-red-500/10 px-1 rounded">
                      arXiv
                    </span>
                  )}
                </div>

                {/* Inline Citation Live Preview Box */}
                <div className="p-2 bg-zinc-950/80 rounded-lg border border-zinc-850 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] uppercase font-mono text-zinc-500">Insert:</span>
                    <span className="font-mono text-amber-400 font-bold truncate">
                      {inTextPreview}
                    </span>
                  </div>

                  {/* Optional Page Number */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-[10px] text-zinc-500">p.</span>
                    <input
                      type="text"
                      placeholder="e.g. 5"
                      value={pageInputs[paper.id] || ''}
                      onChange={(e) => handlePageChange(paper.id, e.target.value)}
                      className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 text-center focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
                  {onOpenPdfViewer && paper.doc_name.endsWith('.pdf') ? (
                    <button
                      type="button"
                      onClick={() => onOpenPdfViewer(paper.doc_name, 1)}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>View PDF</span>
                    </button>
                  ) : <div />}

                  <button
                    type="button"
                    onClick={() => handleInsert(paper)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold rounded-md text-xs transition-colors cursor-pointer shadow-sm active:scale-95"
                  >
                    <Quote className="h-3 w-3" />
                    <span>Insert Citation</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
