import React from 'react';
import { X, BookmarkPlus, FileText, Check, Sparkles, ExternalLink, Loader2 } from 'lucide-react';

/**
 * Slide-over drawer displaying vector similarity citation candidates for a highlighted claim.
 */
export default function CitationDrawer({
  isOpen,
  onClose,
  query,
  candidates,
  isLoading,
  onInsertCitation,
  onOpenPdfViewer,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-zinc-950/98 border-l border-zinc-800 shadow-2xl backdrop-blur-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* 1. Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <BookmarkPlus className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Semantic Citations</h3>
            <p className="text-[11px] text-zinc-400">Ground statements with workspace papers</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Highlighted Statement Banner */}
      <div className="p-3 bg-zinc-900/60 border-b border-zinc-800/80">
        <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
          <span>Claim Selection:</span>
        </div>
        <p className="text-xs text-zinc-200 italic line-clamp-3 bg-zinc-950/70 p-2 rounded-lg border border-zinc-800">
          "{query}"
        </p>
      </div>

      {/* 3. Candidate List Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <p className="text-xs">Searching ChromaDB vector embeddings across workspace papers...</p>
          </div>
        ) : candidates && candidates.length > 0 ? (
          candidates.map((candidate, idx) => {
            const matchPercentage = Math.round((candidate.similarity_score || 0.8) * 100);
            const isHighConfidence = matchPercentage >= 75;

            return (
              <div
                key={candidate.chunk_id || idx}
                className="p-3.5 bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 rounded-xl transition-all flex flex-col gap-2.5 group shadow-sm"
              >
                {/* Candidate Header: Source & Confidence */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-100 truncate" title={candidate.paper_title || candidate.doc_name}>
                        {candidate.paper_title || candidate.doc_name}
                      </span>
                    </div>

                    {/* Authors & Year or Filename metadata */}
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-zinc-400 flex-wrap">
                      {candidate.authors && (
                        <span className="truncate max-w-[180px] text-zinc-300 font-medium" title={candidate.authors}>
                          {candidate.authors}
                        </span>
                      )}
                      {candidate.year && (
                        <span className="font-mono text-zinc-400">({candidate.year})</span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700/60 ml-auto">
                        p.{candidate.page_number}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      isHighConfidence
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {matchPercentage}%
                  </span>
                </div>

                {/* Excerpt Snippet */}
                <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60 font-sans line-clamp-4">
                  "{candidate.excerpt}"
                </p>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1 mt-0.5 border-t border-zinc-800/40">
                  {onOpenPdfViewer && (
                    <button
                      type="button"
                      onClick={() => onOpenPdfViewer(candidate.doc_name, candidate.page_number)}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>View in PDF</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onInsertCitation(candidate)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium text-xs shadow-md transition-all active:scale-95 cursor-pointer ml-auto"
                  >
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>Insert Citation</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 gap-2">
            <p className="text-xs">No direct citation matches found for this claim.</p>
            <p className="text-[11px] text-zinc-500">Try highlighting a more specific factual statement.</p>
          </div>
        )}
      </div>
    </div>
  );
}
