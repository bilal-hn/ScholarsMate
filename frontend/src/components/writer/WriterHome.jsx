import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, FileText, ListTree, Pencil, Plus, Trash2, X } from 'lucide-react';
import DocumentWriter from './DocumentWriter';
import ErrorBoundary from '../common/ErrorBoundary';
import {
  listWriterDocsAPI,
  createWriterDocAPI,
  updateWriterDocAPI,
  deleteWriterDocAPI,
} from '../../services/api';

const LAST_DOC_KEY = 'scholarsmate_writer_last_doc';

const readLastDoc = () => {
  try {
    return localStorage.getItem(LAST_DOC_KEY);
  } catch {
    return null;
  }
};

const writeLastDoc = (id) => {
  try {
    if (id) localStorage.setItem(LAST_DOC_KEY, id);
    else localStorage.removeItem(LAST_DOC_KEY);
  } catch {
    /* storage unavailable: remembering the last doc is a convenience only */
  }
};

const byUpdatedDesc = (a, b) => (b.updated_at || '').localeCompare(a.updated_at || '');

/**
 * /writer: the user's standalone documents on the left, DocumentWriter for the open one.
 */
export default function WriterHome({
  onNavigate,
  documents = [],
  currentModel = '',
  onOpenPdfViewer,
}) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [listError, setListError] = useState(false);
  const [listNonce, setListNonce] = useState(0);
  const [focusReq, setFocusReq] = useState(null);
  const [headings, setHeadings] = useState([]); // outline of the open document
  const [newDocId, setNewDocId] = useState(null); // a doc just created: focus its title
  const scrollToHeadingRef = useRef(null);
  const cancelRef = useRef(false);
  const asideRef = useRef(null);

  // Focus a control by selector once the DOM has updated.
  useEffect(() => {
    if (focusReq) asideRef.current?.querySelector(focusReq.sel)?.focus();
  }, [focusReq]);

  const selectDoc = useCallback((id) => {
    setOpenId(id);
    setHeadings([]);
    setNewDocId((cur) => (cur === id ? cur : null));
    writeLastDoc(id);
    setConfirmDeleteId(null);
    setRenamingId(null);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await listWriterDocsAPI();
        if (!alive) return;
        const sorted = [...(Array.isArray(list) ? list : [])].sort(byUpdatedDesc);
        setDocs(sorted);
        const last = readLastDoc();
        const initial = sorted.find((d) => d.id === last) || sorted[0] || null;
        setOpenId(initial ? initial.id : null);
        if (initial) writeLastDoc(initial.id);
      } catch {
        if (alive) setListError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [listNonce]);

  const handleNew = async () => {
    setError('');
    try {
      const doc = await createWriterDocAPI({});
      setDocs((prev) => [doc, ...prev].sort(byUpdatedDesc));
      setNewDocId(doc.id);
      selectDoc(doc.id);
    } catch {
      setError('Could not create a document.');
    }
  };

  // Stable: DocumentWriter lists it as an autosave dependency.
  const handleSaved = useCallback((saved) => {
    if (!saved?.id) return;
    setDocs((prev) =>
      prev
        .map((d) => (d.id === saved.id ? { ...d, title: saved.title, updated_at: saved.updated_at } : d))
        .sort(byUpdatedDesc)
    );
  }, []);

  // Stable: DocumentWriter lists it as an effect dependency.
  const handleOutlineReady = useCallback((fn) => {
    scrollToHeadingRef.current = fn;
  }, []);

  const startRename = (doc) => {
    cancelRef.current = false;
    setConfirmDeleteId(null);
    setRenamingId(doc.id);
    setRenameValue(doc.title || '');
  };

  const commitRename = async () => {
    if (cancelRef.current || !renamingId) return;
    const id = renamingId;
    const title = renameValue.trim();
    cancelRef.current = true; // Enter then blur must not commit twice
    setRenamingId(null);
    const current = docs.find((d) => d.id === id);
    if (!id || !title || title === current?.title) return;
    try {
      const saved = await updateWriterDocAPI(id, { title });
      handleSaved(saved);
    } catch {
      setError('Could not rename the document.');
    }
  };

  const handleDelete = async (id) => {
    setConfirmDeleteId(null);
    try {
      await deleteWriterDocAPI(id);
      const idx = docs.findIndex((d) => d.id === id);
      const rest = docs.filter((d) => d.id !== id);
      const next = rest[Math.min(idx, rest.length - 1)];
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (id === openId) selectDoc(next?.id ?? null);
      setFocusReq({ sel: next ? `[data-doc-open="${next.id}"]` : '[data-new-doc]' });
    } catch {
      setError('Could not delete the document.');
    }
  };

  return (
    <div className="flex flex-1 min-h-0 w-full bg-zinc-950 text-zinc-200">
      <aside ref={asideRef} className="w-64 shrink-0 border-r border-zinc-800 bg-zinc-900 flex flex-col min-h-0" aria-label="Documents">
        <div className="px-3 py-3 border-b border-zinc-800 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate?.('chat')}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Back to chat"
            title="Back to chat"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-zinc-100 flex-1">Documents</span>
          <button
            type="button"
            onClick={handleNew}
            data-new-doc
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors cursor-pointer"
            aria-label="New document"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        </div>

        {(error || listError) && (
          <div role="alert" className="px-3 py-2 text-xs text-red-400 border-b border-zinc-800 flex items-center justify-between gap-2">
            <span>{listError ? 'Could not load your documents.' : error}</span>
            {listError && (
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setListError(false);
                  setListNonce((n) => n + 1);
                }}
                className="px-1.5 py-0.5 rounded text-[11px] text-zinc-100 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <ul className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {loading && <li className="px-2 py-2 text-xs text-zinc-500">Loading...</li>}
          {!loading && !listError && docs.length === 0 && (
            <li className="px-2 py-2 text-xs text-zinc-500">No documents yet.</li>
          )}
          {docs.map((doc) => {
            const label = doc.title || 'Untitled document';
            const isActive = doc.id === openId;
            return (
              <li
                key={doc.id}
                className={`group flex items-center gap-1 rounded-md border ${
                  isActive ? 'bg-zinc-800 border-zinc-700' : 'border-transparent hover:bg-zinc-800/40'
                }`}
              >
                {renamingId === doc.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') {
                        cancelRef.current = true;
                        setRenamingId(null);
                      }
                    }}
                    aria-label={`Rename ${label}`}
                    className="flex-1 min-w-0 mx-1 my-1 px-2 py-1 text-xs bg-zinc-950 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-amber-500/60"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => selectDoc(doc.id)}
                    data-doc-open={doc.id}
                    aria-current={isActive ? 'true' : undefined}
                    className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left text-xs cursor-pointer ${
                      isActive ? 'text-zinc-100 font-medium' : 'text-zinc-400 group-hover:text-zinc-100'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="truncate">{label}</span>
                  </button>
                )}

                {renamingId !== doc.id && confirmDeleteId === doc.id ? (
                  <span className="flex items-center gap-0.5 pr-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      autoFocus
                      className="px-1.5 py-0.5 rounded text-[11px] font-medium text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 cursor-pointer"
                      aria-label={`Confirm delete ${label}`}
                    >
                      Delete?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        setFocusReq({ sel: `[data-doc-delete="${doc.id}"]` });
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-100 cursor-pointer"
                      aria-label="Cancel delete"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  renamingId !== doc.id && (
                    <span className="flex items-center pr-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => startRename(doc)}
                        disabled={isActive}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-zinc-500"
                        aria-label={isActive ? 'Rename in the editor title' : `Rename ${label}`}
                        title={isActive ? 'Rename in the editor title' : 'Rename'}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        data-doc-delete={doc.id}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 cursor-pointer"
                        aria-label={`Delete ${label}`}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  )
                )}
              </li>
            );
          })}
        </ul>

        <nav aria-label="Outline" className="shrink-0 max-h-[40%] flex flex-col border-t border-zinc-800">
          <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <ListTree className="h-3.5 w-3.5" />
            <span>Outline</span>
          </div>
          {headings.length === 0 ? (
            <p className="px-3 pb-3 text-xs text-zinc-500">Headings (H1 to H3) appear here.</p>
          ) : (
            <ul className="overflow-y-auto px-2 pb-2">
              {headings.map((h, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => scrollToHeadingRef.current?.(i)}
                    style={{ paddingLeft: `${0.5 + (h.level - 1) * 0.75}rem` }}
                    className={`w-full text-left pr-2 py-1 rounded-md text-xs truncate cursor-pointer text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 ${h.level === 1 ? 'font-medium text-zinc-300' : ''}`}
                    title={h.text}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        {openId ? (
          <ErrorBoundary key={openId} title="Could not display Document Writer">
            <DocumentWriter
              source={{ type: 'doc', id: openId }}
              onSaved={handleSaved}
              autoFocusTitle={openId === newDocId}
              onHeadingsChange={setHeadings}
              onOutlineReady={handleOutlineReady}
              documents={documents}
              currentModel={currentModel}
              onOpenPdfViewer={onOpenPdfViewer}
              isFullscreen={false}
              onClose={() => onNavigate?.('chat')}
            />
          </ErrorBoundary>
        ) : (
          !loading && !listError && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <FileText className="h-8 w-8 text-zinc-600" />
              <p className="text-sm text-zinc-400">You have no documents yet.</p>
              <button
                type="button"
                onClick={handleNew}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>New document</span>
              </button>
            </div>
          )
        )}
      </main>
    </div>
  );
}
