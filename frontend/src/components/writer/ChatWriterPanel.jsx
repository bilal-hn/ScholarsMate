import { useState, useEffect, useCallback } from 'react';
import DocumentWriter from './DocumentWriter';
import { listWriterDocsAPI, getGuestId } from '../../services/api';

// The choice survives the split-view / fullscreen remount that App does, but not a reload. It is
// keyed by who is signed in as well as the chat, so it cannot carry over to the next user.
const chosenBySession = new Map();
const choiceKey = (sessionId) => {
  if (!sessionId) return null; // no chat yet: nothing to remember it against
  let who;
  try {
    who = localStorage.getItem('scholarsmate_auth_token') || getGuestId();
  } catch {
    who = 'anonymous';
  }
  return `${who}|${sessionId}`;
};

/**
 * The writer in the chat panel. A header switcher picks what it edits: this chat's draft
 * (the default) or any of the user's standalone documents. DocumentWriter is keyed by source,
 * so switching flushes the pending save and loads the other document.
 */
export default function ChatWriterPanel({ sessionId, ...writerProps }) {
  const [docId, setDocId] = useState(() => {
    const key = choiceKey(sessionId);
    return (key && chosenBySession.get(key)) || null;
  });
  const [docs, setDocs] = useState([]);
  const [listNonce, setListNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    listWriterDocsAPI()
      .then((list) => {
        if (alive) setDocs(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        /* the switcher still offers this chat's draft */
      });
    return () => {
      alive = false;
    };
  }, [listNonce]);

  const choose = (value) => {
    const next = value === 'session' ? null : value;
    const key = choiceKey(sessionId);
    if (key) chosenBySession.set(key, next);
    setDocId(next);
  };

  // Stable: DocumentWriter lists it as an autosave dependency.
  const handleSaved = useCallback((saved) => {
    if (!saved?.id) return;
    setDocs((prev) => prev.map((d) => (d.id === saved.id ? { ...d, title: saved.title } : d)));
  }, []);

  const source = docId ? { type: 'doc', id: docId } : { type: 'session', id: sessionId };

  return (
    <div className="flex flex-col w-full h-full min-w-0">
      <div className="shrink-0 flex items-center gap-2 px-3.5 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs">
        <label htmlFor="writer-source" className="text-zinc-400 shrink-0">Editing</label>
        <select
          id="writer-source"
          value={docId || 'session'}
          onChange={(e) => choose(e.target.value)}
          onFocus={() => setListNonce((n) => n + 1)}
          aria-label="Document source"
          className="min-w-0 flex-1 max-w-xs bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/70 cursor-pointer"
        >
          <option value="session">This chat&apos;s draft</option>
          {docs.length > 0 && (
            <optgroup label="Your documents">
              {docs.map((d) => (
                <option key={d.id} value={d.id}>{d.title || 'Untitled document'}</option>
              ))}
            </optgroup>
          )}
          {docId && !docs.some((d) => d.id === docId) && <option value={docId}>Selected document</option>}
        </select>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <DocumentWriter
          key={`${source.type}:${source.id}`}
          source={source}
          onSaved={docId ? handleSaved : undefined}
          {...writerProps}
        />
      </div>
    </div>
  );
}
