import { useEffect, useRef } from 'react';
import { X, BookMarked } from 'lucide-react';
import CitationDrawer from './CitationDrawer';
import LibraryCitationDrawer from './LibraryCitationDrawer';
import { CITATION_STYLES } from '../../utils/citationFormat';

const TABS = [
  { id: 'library', label: 'From library' },
  { id: 'ai', label: 'AI match' },
];

/**
 * One slide-over for every way of citing: pick a paper from the library, or let the AI match
 * the selected claim to passages. The citation style is a document setting shown at the top.
 */
export default function CiteDrawer({
  isOpen,
  onClose,
  tab,
  onTabChange,
  citationStyle,
  onStyleChange,
  claim,
  candidates,
  isSearching,
  onInsertMatch,
  onInsertLibrary,
  citations,
  workspaceDocs,
  onOpenPdfViewer,
}) {
  const activeTabRef = useRef(null);

  // On open, focus lands on the active tab so keyboard users start inside the dialog.
  useEffect(() => {
    if (isOpen) activeTabRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cite"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-zinc-950/98 border-l border-zinc-800 shadow-2xl backdrop-blur-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200"
    >
      <div className="p-4 pb-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <BookMarked className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100">Cite</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close cite drawer"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-2 shrink-0">
        <label htmlFor="cite-style" className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Style
        </label>
        <select
          id="cite-style"
          value={citationStyle}
          onChange={(e) => onStyleChange(e.target.value)}
          aria-label="Citation style"
          className="bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/70 cursor-pointer"
        >
          {CITATION_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} {s.example}
            </option>
          ))}
        </select>
      </div>

      <div role="tablist" aria-label="Citation source" className="flex border-b border-zinc-800 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`cite-tab-${t.id}`}
            ref={tab === t.id ? activeTabRef : null}
            aria-selected={tab === t.id}
            aria-controls={`cite-panel-${t.id}`}
            onClick={() => onTabChange(t.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              tab === t.id
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`cite-panel-${tab}`}
        aria-labelledby={`cite-tab-${tab}`}
        className="flex-1 min-h-0 flex flex-col"
      >
        {tab === 'library' ? (
          <LibraryCitationDrawer
            onInsertCitation={onInsertLibrary}
            existingCitations={citations}
            workspaceDocs={workspaceDocs}
            onOpenPdfViewer={onOpenPdfViewer}
            citationStyle={citationStyle}
          />
        ) : (
          <CitationDrawer
            query={claim}
            candidates={candidates}
            isLoading={isSearching}
            onInsertCitation={onInsertMatch}
            onOpenPdfViewer={onOpenPdfViewer}
          />
        )}
      </div>
    </div>
  );
}
