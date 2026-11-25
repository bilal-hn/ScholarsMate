import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';

// ponytail: matches are found one text node at a time, so a match that crosses a formatting
// boundary (for example "bo<b>ld</b>") is not found. Upgrade: search a concatenated text map.
function collectMatches(root, query, matchCase) {
  if (!root || !query) return [];
  const needle = matchCase ? query : query.toLowerCase();
  const found = [];
  let pos = 0; // running character offset, so a match has a document-order position
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('.citation-ref, .word-page-break')
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const hay = matchCase ? node.nodeValue : node.nodeValue.toLowerCase();
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
      found.push({ node, start: at, end: at + needle.length, pos: pos + at });
    }
    pos += node.nodeValue.length;
  }
  return found;
}

const toRange = (m) => {
  const r = document.createRange();
  r.setStart(m.node, m.start);
  r.setEnd(m.node, m.end);
  return r;
};

const setHighlights = (all, current) => {
  if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
  CSS.highlights.delete('find-match');
  CSS.highlights.delete('find-current');
  if (all.length) CSS.highlights.set('find-match', new Highlight(...all));
  if (current) CSS.highlights.set('find-current', new Highlight(current));
};

/**
 * Find & Replace strip for the editor. `contentKey` changes whenever the document text changes
 * so the match list is rebuilt. While the bar is open it never touches the document selection
 * (that would move focus into the editor and send keystrokes into the text): matches are shown
 * with CSS highlights, and the selection is only set for the instant of a replacement.
 */
export default function FindReplaceBar({ editorRef, initialQuery = '', showReplace: showReplaceProp, contentKey, onClose }) {
  const [query, setQuery] = useState(initialQuery);
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [showReplace, setShowReplace] = useState(!!showReplaceProp);
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState([]);
  const inputRef = useRef(null);
  const scrollRef = useRef(!!initialQuery); // scroll only after a user action, not on every edit
  const resumeAtRef = useRef(null); // after a replace: continue from the first match past the new text

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Rebuild matches when the query, case flag or document changes.
  useEffect(() => {
    const next = collectMatches(editorRef.current, query, matchCase);
    setMatches(next);
    if (resumeAtRef.current !== null) {
      const at = next.findIndex((m) => m.pos >= resumeAtRef.current);
      resumeAtRef.current = null;
      setIndex(at === -1 ? 0 : at);
    } else {
      setIndex((i) => (next.length ? Math.min(i, next.length - 1) : 0));
    }
  }, [query, matchCase, contentKey, editorRef]);

  // Paint highlights and scroll the current match into view. The selection is left alone.
  useEffect(() => {
    const ranges = matches.map(toRange);
    const cur = ranges[index] || null;
    setHighlights(ranges, cur);
    if (cur && scrollRef.current) {
      scrollRef.current = false;
      cur.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [matches, index]);

  useEffect(() => () => setHighlights([], null), []);

  const step = useCallback((dir) => {
    if (!matches.length) return;
    scrollRef.current = true;
    setIndex((i) => (i + dir + matches.length) % matches.length);
  }, [matches.length]);

  // Replacing goes through execCommand so each replacement is undoable and fires the editor's
  // input handler (word count, citations, autosave). Focus then returns to the find field.
  const replaceRange = (range) => {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    editorRef.current?.focus();
    document.execCommand('insertText', false, replacement);
  };

  const replaceOne = () => {
    const m = matches[index];
    if (!m) return;
    scrollRef.current = true;
    resumeAtRef.current = m.pos + replacement.length; // "model" -> "models" must not match itself again
    replaceRange(toRange(m));
    inputRef.current?.focus();
  };

  const replaceAll = () => {
    // Back to front keeps earlier offsets in the same text node valid.
    matches.map(toRange).reverse().forEach(replaceRange);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  };

  const btn = 'px-2 py-1 rounded-md text-xs text-zinc-200 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  const field = 'w-44 bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/70';

  return (
    <div role="search" aria-label="Find and replace" className="shrink-0 bg-zinc-900 border-b border-zinc-800 px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-300 z-30">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          scrollRef.current = true;
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Find"
        aria-label="Find"
        className={field}
      />
      <span className="tabular-nums text-zinc-400 min-w-[3.5rem]" aria-live="polite">
        {query ? (matches.length ? `${index + 1} of ${matches.length}` : 'No matches') : ''}
      </span>
      <button type="button" className={btn} onClick={() => step(-1)} disabled={!matches.length} aria-label="Previous match" title="Previous (Shift+Enter)">
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={btn} onClick={() => step(1)} disabled={!matches.length} aria-label="Next match" title="Next (Enter)">
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={matchCase}
          onChange={(e) => {
            scrollRef.current = true;
            setMatchCase(e.target.checked);
          }}
          aria-label="Match case"
        />
        <span>Match case</span>
      </label>
      {!showReplace && (
        <button type="button" className={btn} onClick={() => setShowReplace(true)} aria-label="Show replace">
          Replace
        </button>
      )}
      {showReplace && (
        <>
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Replace with"
            aria-label="Replace with"
            className={field}
          />
          <button type="button" className={btn} onClick={replaceOne} disabled={!matches.length} aria-label="Replace">
            Replace
          </button>
          <button type="button" className={btn} onClick={replaceAll} disabled={!matches.length} aria-label="Replace all">
            Replace all
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="ml-auto p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
        aria-label="Close find and replace"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
