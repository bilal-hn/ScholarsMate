import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Minus,
  RemoveFormatting,
  Copy,
  Check,
  Download,
  FileText,
  FileCode,
  FilePlus,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  BookMarked,
  Superscript,
  Subscript,
  Highlighter,
  IndentIncrease,
  IndentDecrease,
  ArrowUpDown,
  Search,
  Rows3,
  Columns3,
  Trash2,
  PaintBucket,
  TableProperties,
} from 'lucide-react';
import FloatingBubbleMenu from './FloatingBubbleMenu';
import CiteDrawer from './CiteDrawer';
import InlineAskAIDrawer from './InlineAskAIDrawer';
import FindReplaceBar from './FindReplaceBar';
import { tableHtml, getCellContext, runTableOp, applyTableHtml, SHADE_COLORS } from './tableOps';
import { PAGE_SIZES, exportDocx, exportPdf, markdownText, downloadMarkdown } from './docExport';
import {
  normalizeStyle,
  inTextLabel,
  bibliographyEntries,
  reconcileCitations,
  styleOfCitations,
} from '../../utils/citationFormat';
import {
  getDraftAPI,
  saveDraftAPI,
  findCitationsAPI,
  editorAskAIAPI,
  getWriterDocAPI,
  updateWriterDocAPI,
} from '../../services/api';

const FONT_FAMILIES = [
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Candara, Segoe, sans-serif' },
  { label: 'Garamond', value: "'EB Garamond', Garamond, serif" },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Source Serif 4', value: "'Source Serif 4', 'Source Serif Pro', Georgia, serif" },
];
const DEFAULT_FONT = FONT_FAMILIES[6];

const MIN_PT = 8;
const MAX_PT = 36;

const BLOCK_STYLES = [
  { label: 'Normal text', tag: 'p' },
  { label: 'Title', tag: 'p', doc: 'title' },
  { label: 'Subtitle', tag: 'p', doc: 'subtitle' },
  { label: 'Heading 1', tag: 'h1' },
  { label: 'Heading 2', tag: 'h2' },
  { label: 'Heading 3', tag: 'h3' },
];

// Written inline as well as via class so PDF export (which has no stylesheet) keeps the look.
const DOC_STYLE_PROPS = {
  title: { fontSize: '2.2em', fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: '1.2em', fontWeight: '400', color: '#475569' },
};

// Readable on the white page in every app theme.
const TEXT_COLORS = [
  { name: 'Black', value: '#111827' },
  { name: 'Slate', value: '#475569' },
  { name: 'Red', value: '#b91c1c' },
  { name: 'Orange', value: '#c2410c' },
  { name: 'Green', value: '#15803d' },
  { name: 'Teal', value: '#0f766e' },
  { name: 'Blue', value: '#1d4ed8' },
  { name: 'Purple', value: '#7e22ce' },
];
const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Cyan', value: '#a5f3fc' },
  { name: 'Pink', value: '#fbcfe8' },
  { name: 'Orange', value: '#fed7aa' },
  { name: 'Lavender', value: '#e9d5ff' },
];

const LINE_SPACINGS = [1.0, 1.15, 1.5, 2.0];
const SPACE_PT = [0, 6, 12, 18];

const PAGE_SIZE_KEY = 'scholarsmate_writer_page_size';
const CITE_STYLE_KEY = 'scholarsmate_writer_cite_style';
const SAVE_DEBOUNCE_MS = 1200;
const SAVE_RETRY_MS = 8000;

const readPref = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the preference just won't persist */
  }
};

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, blockquote, li, :scope > div';

// Writes one autosave snapshot through the branch for its source.
const persistSnapshot = async (snap) => {
  if (snap.sourceType === 'doc') {
    const saved = await updateWriterDocAPI(snap.sourceId, {
      // The server rejects blank titles, so omit it and keep the stored one.
      title: snap.title.trim() || undefined,
      content_html: snap.html,
      citations_data: snap.citations,
    });
    snap.onSaved?.(saved);
  } else {
    await saveDraftAPI({
      session_id: snap.sourceId,
      title: snap.title,
      content_html: snap.html,
      content_markdown: snap.html,
      citations_data: snap.citations,
    });
  }
};

// Saves that have been started but not finished, by source. A DocumentWriter that mounts for the
// same source waits for them before it loads, so it can never read content older than its own edits.
const savesInFlight = new Map();
const trackSave = (key, promise) => {
  const prev = savesInFlight.get(key);
  const chained = Promise.allSettled(prev ? [prev, promise] : [promise]).then(() => {});
  savesInFlight.set(key, chained);
  chained.then(() => {
    if (savesInFlight.get(key) === chained) savesInFlight.delete(key);
  });
  return promise;
};
const sourceKeyOf = (type, id) => `${type}:${id}`;

const textToHtml = (text) =>
  text
    .split(/\n{2,}/)
    .map((para) =>
      `<p>${para.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`
    )
    .join('');

const marginInches = (el) => {
  const v = el.style.marginLeft;
  const n = parseFloat(v);
  if (!v || Number.isNaN(n)) return 0;
  return v.endsWith('px') ? n / 96 : n;
};

const RIBBON_BTN =
  'p-1.5 min-w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0 text-xs';
const MENU_ITEM =
  'w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-amber-300 transition-colors cursor-pointer';

// Keeps the editor selection while a ribbon button is pressed.
const keepSelection = (e) => e.preventDefault();

function RibbonButton({ label, onClick, active, className = '', children }) {
  return (
    <button
      type="button"
      onMouseDown={keepSelection}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`${RIBBON_BTN} ${active ? 'bg-amber-500/15 text-amber-400' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div role="separator" aria-orientation="vertical" className="h-4 w-px bg-zinc-800 mx-0.5 shrink-0" />;
}

function Group({ label, children }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5">
      {children}
    </div>
  );
}

// A ribbon button that opens a small popover. Only one popover is open at a time.
function Popover({ id, openMenu, setOpenMenu, onEscape, label, trigger, panelClass = '', children }) {
  const open = openMenu === id;
  const panelRef = useRef(null);

  // On open, focus the first control in the panel.
  useEffect(() => {
    if (open) panelRef.current?.querySelector('button, input')?.focus();
  }, [open]);

  return (
    <div
      className="relative shrink-0"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpenMenu(null);
          onEscape?.();
        }
      }}
    >
      <button
        type="button"
        onMouseDown={keepSelection}
        onClick={() => setOpenMenu(open ? null : id)}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        title={label}
        className={`flex items-center gap-1 px-1.5 h-7 rounded-lg hover:bg-zinc-800 text-zinc-200 text-xs font-medium border border-transparent hover:border-zinc-700/60 transition-colors cursor-pointer ${open ? 'bg-zinc-800' : ''}`}
      >
        {trigger}
        <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
      </button>
      {open && (
        <div ref={panelRef} className={`absolute top-full left-0 mt-1.5 p-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 ${panelClass}`}>
          {children}
        </div>
      )}
    </div>
  );
}

function Swatches({ colors, prefix, onPick, onClear, clearLabel }) {
  return (
    <div className="p-1.5 w-40">
      <div className="grid grid-cols-4 gap-1.5">
        {colors.map((c) => (
          <button
            key={c.value}
            type="button"
            onMouseDown={keepSelection}
            onClick={() => onPick(c.value)}
            aria-label={`${prefix} ${c.name}`}
            title={c.name}
            className="h-6 w-full rounded-md border border-zinc-600 cursor-pointer hover:scale-105 transition-transform"
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>
      <button type="button" onMouseDown={keepSelection} onClick={onClear} className={`${MENU_ITEM} mt-1.5`}>
        {clearLabel}
      </button>
    </div>
  );
}

function TableGrid({ onPick }) {
  const [hover, setHover] = useState({ rows: 3, cols: 3 });
  return (
    <>
      <div className="text-[11px] font-semibold text-zinc-300 mb-2 flex items-center justify-between">
        <span>Insert Table</span>
        <span className="font-mono text-amber-400 text-[10px]">{hover.rows} × {hover.cols}</span>
      </div>
      <div className="grid grid-cols-6 gap-1 bg-zinc-950 p-2 rounded-lg border border-zinc-800">
        {[1, 2, 3, 4, 5, 6].map((r) =>
          [1, 2, 3, 4, 5, 6].map((c) => (
            <button
              type="button"
              key={`${r}-${c}`}
              onMouseEnter={() => setHover({ rows: r, cols: c })}
              onFocus={() => setHover({ rows: r, cols: c })}
              onMouseDown={keepSelection}
              onClick={() => onPick(r, c)}
              aria-label={`Insert ${r} by ${c} table`}
              className={`w-5 h-5 rounded-xs border cursor-pointer transition-all ${
                r <= hover.rows && c <= hover.cols
                  ? 'bg-amber-400/80 border-amber-300 shadow-xs'
                  : 'bg-zinc-900 border-zinc-700/60 hover:border-zinc-500'
              }`}
            />
          ))
        )}
      </div>
      <div className="mt-2 text-center text-[10px] text-zinc-400">Click to insert {hover.rows} × {hover.cols} Table</div>
    </>
  );
}

export default function DocumentWriter({
  source, // { type: 'session' | 'doc', id }
  onSaved, // optional: called with the saved doc after a standalone-doc autosave
  documents = [],
  currentModel = '',
  onOpenPdfViewer,
  isFullscreen = false,
  onToggleFullscreen,
  onClose,
  autoFocusTitle = false, // focus the title once the document has loaded (a fresh "New" doc)
  onHeadingsChange, // optional: called with [{ level, text }] for the outline
  onOutlineReady, // optional: called with scrollToHeading(index), or null on unmount
}) {
  const sourceType = source?.type;
  const sourceId = source?.id;
  const editorRef = useRef(null);
  const canvasRef = useRef(null); // the full document canvas (incl. references)
  const titleRef = useRef(null);
  const [title, setTitle] = useState('');
  const [citations, setCitations] = useState([]);
  const [citationStyle, setCitationStyleState] = useState(() => normalizeStyle(readPref(CITE_STYLE_KEY, 'ieee')));
  const citationsRef = useRef([]);
  const styleRef = useRef(citationStyle);
  const prunedRef = useRef(new Map()); // citations whose span was deleted; restored if Undo brings it back
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved' | 'error'
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const [pageCount, setPageCount] = useState(1);
  const [pageSize, setPageSizeState] = useState(() => (PAGE_SIZES[readPref(PAGE_SIZE_KEY, 'letter')] ? readPref(PAGE_SIZE_KEY, 'letter') : 'letter'));
  const [copied, setCopied] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);

  // Popover menus: one open at a time
  const [openMenu, setOpenMenu] = useState(null);

  // Typography state (what the ribbon shows)
  const [currentFont, setCurrentFont] = useState(DEFAULT_FONT.value);
  const [currentFontLabel, setCurrentFontLabel] = useState(DEFAULT_FONT.label);
  const [baseFontSize, setBaseFontSize] = useState(12);
  const [sizeInput, setSizeInput] = useState('12');
  const [currentBlockLabel, setCurrentBlockLabel] = useState('Normal text');
  const [activeAlign, setActiveAlign] = useState('justifyLeft');
  const [lastTextColor, setLastTextColor] = useState('#b91c1c');
  const [lastHighlight, setLastHighlight] = useState('#fef08a');
  const [inTable, setInTable] = useState(false);

  // Selection & bubble menu
  const [bubblePosition, setBubblePosition] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const savedSelectionRange = useRef(null);

  // Cite drawer
  const [isCiteOpen, setIsCiteOpen] = useState(false);
  const [citeTab, setCiteTab] = useState('library');
  const [citeClaim, setCiteClaim] = useState('');
  const [citeCandidates, setCiteCandidates] = useState([]);
  const [citeSearching, setCiteSearching] = useState(false);
  const searchedClaimRef = useRef(null);

  // Ask AI drawer
  const [isAskOpen, setIsAskOpen] = useState(false);
  const [askSelection, setAskSelection] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResult, setAskResult] = useState('');
  const [askThinking, setAskThinking] = useState('');
  const [askCanApply, setAskCanApply] = useState(true);

  // Find & Replace
  const [find, setFind] = useState(null); // { replace, query, nonce } while open
  const [contentKey, setContentKey] = useState(0);

  const escPressedRef = useRef(false); // Escape then Tab leaves the editor instead of indenting
  const seenRef = useRef(new Set()); // citation ids that have had a span in this document
  const outlineRef = useRef('[]');

  // --------------------------------------------------------------------------
  // Helpers: stats, outline, citations model
  // --------------------------------------------------------------------------
  const updateStats = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const text = ed.innerText || '';
    setStats({ words: text.trim().split(/\s+/).filter(Boolean).length, chars: text.replace(/\n/g, '').length });

    if (onHeadingsChange) {
      const list = Array.from(ed.querySelectorAll('h1, h2, h3')).map((h) => ({
        level: Number(h.tagName[1]),
        text: h.textContent.trim() || 'Untitled heading',
      }));
      const json = JSON.stringify(list);
      if (json !== outlineRef.current) {
        outlineRef.current = json;
        onHeadingsChange(list);
      }
    }
  }, [onHeadingsChange]);

  const commitCitations = useCallback((next) => {
    citationsRef.current = next;
    setCitations(next);
  }, []);

  // Reconciles the citations model with the spans in the document: drops citations whose span
  // is gone, numbers sources by first appearance, and rewrites every label in the current style.
  // `add` is a citation whose span has just been inserted. Returns the up-to-date citations.
  const syncCitations = useCallback((add, styleOverride) => {
    const ed = editorRef.current;
    const prev = citationsRef.current;
    if (!ed) return prev;
    const style = styleOverride || styleRef.current;

    const spans = Array.from(ed.querySelectorAll('span.citation-ref[data-citation-id]'));
    const ids = spans.map((s) => s.dataset.citationId);
    ids.forEach((id) => seenRef.current.add(id));
    const live = new Set(prev.map((c) => String(c.id)));
    const pool = [
      ...prev,
      ...(add ? [add] : []),
      ...Array.from(prunedRef.current.values()).filter((c) => !live.has(String(c.id))),
    ];
    const next = reconcileCitations(pool, ids, seenRef.current).map((c) => (c.citation_style === style ? c : { ...c, citation_style: style }));
    const keptIds = new Set(next.map((c) => String(c.id)));
    prunedRef.current = new Map(pool.filter((c) => !keptIds.has(String(c.id))).map((c) => [String(c.id), c]));

    const byId = new Map(next.map((c) => [String(c.id), c]));
    spans.forEach((span) => {
      const c = byId.get(span.dataset.citationId);
      if (!c) return;
      const parent = span.parentElement;
      // Older drafts wrapped IEEE labels in <sup>; unwrap so every style reads the same way.
      if (parent && parent.tagName === 'SUP' && parent.childNodes.length === 1 && parent !== ed) parent.replaceWith(span);
      const label = inTextLabel(c, style);
      if (span.textContent !== label) span.textContent = label;
      span.dataset.docRef = String(c.doc_index);
      span.dataset.citeStyle = style;
    });

    const same =
      next.length === prev.length &&
      next.every((c, i) => c.id === prev[i].id && c.doc_index === prev[i].doc_index && c.citation_style === prev[i].citation_style);
    if (!same) commitCitations(next);
    return same ? prev : next;
  }, [commitCitations]);

  const restoreEditorSelection = () => {
    const ed = editorRef.current;
    if (!ed) return null;
    // Decide before focusing: focus() can move the selection, and a selection that was already in
    // the editor is the user's current one. Otherwise put the saved range back.
    const before = window.getSelection();
    const wasInEditor = !!(before && before.rangeCount > 0 && ed.contains(before.anchorNode));
    ed.focus();
    if (wasInEditor) return window.getSelection();
    const range = savedSelectionRange.current;
    if (range && ed.contains(range.commonAncestorContainer)) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return window.getSelection();
  };

  const popoverProps = { openMenu, setOpenMenu, onEscape: restoreEditorSelection };

  // --------------------------------------------------------------------------
  // Draft load
  // --------------------------------------------------------------------------
  const loadedRef = useRef(false); // true only after a successful load; gates all saves
  const [loadError, setLoadError] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const autoFocusRef = useRef(autoFocusTitle);

  useEffect(() => {
    let isMounted = true;
    loadedRef.current = false;
    prunedRef.current = new Map();
    seenRef.current = new Set();

    const loadDraft = async () => {
      if (!sourceId) return;
      try {
        // A previous instance for this source may still be saving; read only after it lands.
        await savesInFlight.get(sourceKeyOf(sourceType, sourceId));
        const draft = sourceType === 'doc'
          ? await getWriterDocAPI(sourceId)
          : await getDraftAPI(sourceId);
        if (!draft) throw new Error('empty load result');
        if (isMounted) {
          setTitle(draft.title && draft.title !== 'Fyp' ? draft.title : '');
          const loaded = Array.isArray(draft.citations_data) ? draft.citations_data : [];
          citationsRef.current = loaded;
          setCitations(loaded);
          const style = styleOfCitations(loaded, readPref(CITE_STYLE_KEY, 'ieee'));
          styleRef.current = style;
          setCitationStyleState(style);
          if (editorRef.current) {
            let initialHtml = draft.content_html || '';
            // Purge any legacy references blocks that were accidentally persisted into content_html
            initialHtml = initialHtml
              .replace(/<div[^>]*class="[^"]*references[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
              .replace(/<div[^>]*id="reference-[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
              .replace(/<h[1-6][^>]*>References\s*&\s*Bibliography<\/h[1-6]>/gi, '');

            editorRef.current.innerHTML = initialHtml || '';
            seenRef.current = new Set(
              Array.from(editorRef.current.querySelectorAll('span.citation-ref[data-citation-id]')).map((el) => el.dataset.citationId)
            );
            // Enter makes <p> blocks (not <div>), so the paragraph tools see real paragraphs.
            document.execCommand('defaultParagraphSeparator', false, 'p');
            updateStats();
          }
          loadedRef.current = true;
          setLoadError(false);
          setSaveStatus('saved');
          if (autoFocusRef.current) {
            autoFocusRef.current = false;
            titleRef.current?.focus();
          }
        }
      } catch (err) {
        console.error('Error loading draft:', err);
        if (isMounted) setLoadError(true);
      }
    };

    loadDraft();

    return () => {
      isMounted = false;
    };
  }, [sourceType, sourceId, loadNonce, updateStats]);

  // --------------------------------------------------------------------------
  // Autosave
  //
  // pendingSaveRef holds the newest snapshot that has not reached the server: either it is
  // waiting for the debounce or its save failed. Snapshots are plain objects taken at edit
  // time, so a timer never reads an editor that may have unmounted.
  // --------------------------------------------------------------------------
  const autoSaveTimerRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const inFlightRef = useRef(0);
  const flushRef = useRef(null); // lets a failed save schedule its own retry
  const seqRef = useRef(0); // stamps each snapshot, newest highest
  const savedSeqRef = useRef(0); // highest snapshot that reached the server
  const disposedRef = useRef(false); // set on unmount: nothing may retry after it

  const flushNow = useCallback(async () => {
    const snap = pendingSaveRef.current;
    if (!snap || disposedRef.current) return;
    pendingSaveRef.current = null;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    inFlightRef.current += 1;
    setSaveStatus('saving');
    try {
      await trackSave(sourceKeyOf(snap.sourceType, snap.sourceId), persistSnapshot(snap));
      savedSeqRef.current = Math.max(savedSeqRef.current, snap.seq);
      if (!pendingSaveRef.current) setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to auto-save draft:', err);
      // Keep the content and retry, but never a snapshot that a newer one has superseded
      // (it would overwrite newer text), and never after the editor is gone.
      if (!pendingSaveRef.current && snap.seq > savedSeqRef.current && !disposedRef.current) {
        pendingSaveRef.current = snap;
        autoSaveTimerRef.current = setTimeout(() => flushRef.current?.(), SAVE_RETRY_MS);
        setSaveStatus('error');
      }
    } finally {
      inFlightRef.current -= 1;
    }
  }, []);

  useEffect(() => {
    flushRef.current = flushNow;
  }, [flushNow]);

  const triggerAutoSave = useCallback((newHtml, newTitle, newCitations) => {
    if (!sourceId || !loadedRef.current) return;
    // Snapshot now: the editor DOM is gone by the time a late timer fires.
    const html = newHtml ?? editorRef.current?.innerHTML;
    if (html == null) return;
    pendingSaveRef.current = {
      seq: ++seqRef.current,
      sourceType,
      sourceId,
      onSaved,
      html,
      title: newTitle !== undefined ? newTitle : title,
      citations: newCitations !== undefined ? newCitations : citationsRef.current,
    };
    setSaveStatus('unsaved');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => flushNow(), SAVE_DEBOUNCE_MS);
  }, [sourceType, sourceId, onSaved, title, flushNow]);

  // On unmount or source change, flush a pending autosave instead of dropping or corrupting it.
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      const snap = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (snap) {
        trackSave(sourceKeyOf(snap.sourceType, snap.sourceId), persistSnapshot(snap)).catch((err) =>
          console.error('Failed to flush draft:', err)
        );
      }
    };
  }, [sourceType, sourceId]);

  // Warn before leaving with unsaved work; on pagehide make a best-effort save.
  useEffect(() => {
    const warn = (e) => {
      if (pendingSaveRef.current || inFlightRef.current > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const flush = () => flushNow();
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', flush);
    };
  }, [flushNow]);

  // After every edit: keep citations in step with the document, then save an explicit snapshot.
  const handleEditorInput = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const synced = syncCitations();
    updateStats();
    setContentKey((k) => k + 1);
    triggerAutoSave(ed.innerHTML, title, synced);
  }, [syncCitations, updateStats, triggerAutoSave, title]);

  // --------------------------------------------------------------------------
  // Page size and page count
  // --------------------------------------------------------------------------
  const page = PAGE_SIZES[pageSize];

  const setPageSize = (id) => {
    setPageSizeState(id);
    writePref(PAGE_SIZE_KEY, id);
  };

  useEffect(() => {
    const recalc = () => {
      if (!canvasRef.current || !editorRef.current) return;
      const breaks = editorRef.current.querySelectorAll('.word-page-break, .page-break').length;
      const byHeight = Math.ceil((canvasRef.current.scrollHeight || 0) / page.h);
      setPageCount(Math.max(1 + breaks, byHeight));
    };
    recalc();
    if (!canvasRef.current) return;
    const observer = new ResizeObserver(recalc);
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [citations, page.h]);

  // --------------------------------------------------------------------------
  // Outline hook for WriterHome
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!onOutlineReady) return;
    onOutlineReady((index) => {
      const el = editorRef.current?.querySelectorAll('h1, h2, h3')[index];
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => onOutlineReady(null);
  }, [onOutlineReady]);

  // --------------------------------------------------------------------------
  // Selection tracking: bubble menu, saved range, ribbon state
  // --------------------------------------------------------------------------
  useEffect(() => {
    const onSelectionChange = () => {
      const ed = editorRef.current;
      const sel = window.getSelection();
      if (!ed || !sel || !sel.anchorNode || !ed.contains(sel.anchorNode)) {
        setInTable(false);
        return;
      }
      if (sel.rangeCount > 0) savedSelectionRange.current = sel.getRangeAt(0).cloneRange();
      const el = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
      if (!el) return;
      setInTable(!!el.closest('td, th'));
      const px = parseFloat(window.getComputedStyle(el).fontSize);
      if (px) setSizeInput(String(Math.round(px * 0.75)));
      const block = el.closest('h1, h2, h3, h4, p, blockquote, li');
      if (block) {
        const label = block.classList.contains('doc-title') ? 'Title'
          : block.classList.contains('doc-subtitle') ? 'Subtitle'
            : /^H[1-3]$/.test(block.tagName) ? `Heading ${block.tagName[1]}`
              : block.tagName === 'H4' ? 'Subtitle' : 'Normal text';
        setCurrentBlockLabel(label);
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // Escape closes an open popover or menu wherever focus is.
  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openMenu]);

  // Any click outside a popover closes it (popovers stop propagation of their own clicks).
  useEffect(() => {
    const close = () => setOpenMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleSelectionChange = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !editorRef.current) {
      setBubblePosition(null);
      setSelectedText('');
      return;
    }
    if (!editorRef.current.contains(selection.anchorNode)) {
      setBubblePosition(null);
      return;
    }
    const text = selection.toString().trim();
    if (text.length > 2) {
      setSelectedText(text);
      savedSelectionRange.current = selection.getRangeAt(0).cloneRange();
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setBubblePosition({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    } else {
      setBubblePosition(null);
    }
  };

  // --------------------------------------------------------------------------
  // Formatting actions
  // --------------------------------------------------------------------------
  const formatDoc = (command, value = null) => {
    if (command === 'undo' || command === 'redo') editorRef.current?.focus();
    else restoreEditorSelection();
    if (command === 'h1' || command === 'h2' || command === 'h3' || command === 'h4' || command === 'p') {
      document.execCommand('formatBlock', false, `<${command.toUpperCase()}>`);
    } else if (command === 'quote') {
      document.execCommand('formatBlock', false, '<blockquote>');
    } else {
      document.execCommand(command, false, value);
      if (['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
        setActiveAlign(command);
      }
    }
    handleEditorInput();
  };

  // The paragraph-level blocks the selection touches (list items count, their list does not).
  const selectedBlocks = () => {
    const ed = editorRef.current;
    const sel = window.getSelection();
    if (!ed || !sel || sel.rangeCount === 0) return [];
    const range = sel.getRangeAt(0);
    let blocks = Array.from(ed.querySelectorAll(BLOCK_SELECTOR)).filter(
      (el) => !el.matches('.word-page-break, .page-break') &&
        !el.closest('.word-page-break, .page-break') &&
        !el.querySelector('p, h1, h2, h3, h4, blockquote, li, div') &&
        range.intersectsNode(el)
    );
    if (blocks.length === 0) {
      // Bare text in the editor root: make it a paragraph first.
      document.execCommand('formatBlock', false, '<P>');
      blocks = Array.from(ed.querySelectorAll('p')).filter((el) => range.intersectsNode(el));
    }
    return blocks;
  };

  const handleApplyBlockStyle = (style) => {
    setOpenMenu(null);
    restoreEditorSelection();
    document.execCommand('formatBlock', false, `<${style.tag.toUpperCase()}>`);
    selectedBlocks().forEach((b) => {
      b.classList.remove('doc-title', 'doc-subtitle');
      if (!b.classList.length) b.removeAttribute('class');
      Object.keys(DOC_STYLE_PROPS.title).forEach((p) => { b.style[p] = ''; });
      if (style.doc) {
        b.classList.add(`doc-${style.doc}`);
        Object.assign(b.style, DOC_STYLE_PROPS[style.doc]);
      }
    });
    setCurrentBlockLabel(style.label);
    handleEditorInput();
  };

  const handleApplyFont = (fontObj) => {
    setCurrentFont(fontObj.value);
    setCurrentFontLabel(fontObj.label);
    setOpenMenu(null);
    restoreEditorSelection();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontName', false, fontObj.value);
    handleEditorInput();
  };

  const applyFontSize = (pt) => {
    const ed = editorRef.current;
    const sel = restoreEditorSelection();
    if (!ed || !sel) return;
    if (sel.isCollapsed) {
      // No selection: the size becomes the document's base size.
      setBaseFontSize(pt);
      return;
    }
    // With styleWithCSS, execCommand wraps the selection in span[style="font-size: xxx-large"].
    // Set the real size on those spans in place (no node replacement), so the browser's own
    // undo/redo history stays valid.
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    document.execCommand('styleWithCSS', false, false);
    const range = window.getSelection().getRangeAt(0);
    ed.querySelectorAll('span[style*="xxx-large"]').forEach((span) => {
      if (range.intersectsNode(span)) span.style.fontSize = `${pt}pt`;
    });
    handleEditorInput();
  };

  // The size box applies on Enter, on blur and on a spinner step, never per keystroke, and always
  // to the range saved from the editor (the box itself holds focus).
  const sizeDirtyRef = useRef(false);
  const commitSize = (value, via) => {
    const n = Math.round(Number(value));
    sizeDirtyRef.current = false;
    if (!Number.isFinite(n) || n < MIN_PT || n > MAX_PT) {
      setSizeInput(String(Math.min(MAX_PT, Math.max(MIN_PT, n || baseFontSize))));
      return;
    }
    setSizeInput(String(n));
    const saved = savedSelectionRange.current;
    // Leaving the box must not rescale the whole document just because the caret is collapsed.
    if (via === 'blur' && (!saved || saved.collapsed)) return;
    applyFontSize(n);
  };

  const applyColor = (kind, color) => {
    setOpenMenu(null);
    restoreEditorSelection();
    document.execCommand('styleWithCSS', false, true);
    if (kind === 'fore') {
      document.execCommand('foreColor', false, color);
      setLastTextColor(color);
    } else {
      if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color);
      if (color !== 'transparent') setLastHighlight(color);
    }
    document.execCommand('styleWithCSS', false, false);
    handleEditorInput();
  };

  // ponytail: line spacing, space before/after and paragraph indents are written straight to
  // the blocks' inline style, so Ctrl+Z does not undo them. Upgrade: an app-level undo stack.
  const setBlockStyle = (prop, value) => {
    setOpenMenu(null);
    restoreEditorSelection();
    selectedBlocks().forEach((b) => { b.style[prop] = value; });
    handleEditorInput();
  };

  const changeIndent = (dir) => {
    restoreEditorSelection();
    const sel = window.getSelection();
    const el = sel?.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement);
    if (el?.closest('li')) {
      document.execCommand(dir > 0 ? 'indent' : 'outdent', false, null);
    } else {
      // ponytail: paragraph indent is an inline margin-left (0.5in steps), not undoable.
      selectedBlocks().forEach((b) => {
        const next = Math.max(0, Math.round((marginInches(b) + dir * 0.5) * 10) / 10);
        b.style.marginLeft = next ? `${next}in` : '';
      });
    }
    handleEditorInput();
  };

  const handleInsertCustomTable = (rows, cols) => {
    setOpenMenu(null);
    restoreEditorSelection();
    document.execCommand('insertHTML', false, tableHtml(rows, cols));
    handleEditorInput();
  };

  const handleInsertPageBreak = () => {
    restoreEditorSelection();
    const pageBreakHtml = `
      <div class="word-page-break" contenteditable="false" data-page-break="true">
        <div class="page-bottom-space"></div>
        <div class="page-gap-bar"></div>
        <div class="page-top-space"></div>
      </div>
      <p><br/></p>
    `;
    document.execCommand('insertHTML', false, pageBreakHtml);
    handleEditorInput();
  };

  // --------------------------------------------------------------------------
  // Table toolbar
  // --------------------------------------------------------------------------
  const doTableOp = (op, arg) => {
    setOpenMenu(null);
    const ed = editorRef.current;
    const ctx = getCellContext(ed);
    if (!ed || !ctx) return;
    const result = runTableOp(op, ctx, arg);
    applyTableHtml(ed, ctx.table, result.html, result.html ? { r: result.r, c: result.c } : null);
    handleEditorInput();
  };

  // --------------------------------------------------------------------------
  // Citing
  // --------------------------------------------------------------------------
  const setCitationStyle = (style) => {
    const next = normalizeStyle(style);
    styleRef.current = next;
    setCitationStyleState(next);
    writePref(CITE_STYLE_KEY, next);
    const synced = syncCitations(undefined, next);
    triggerAutoSave(editorRef.current?.innerHTML, title, synced);
  };

  const runCiteSearch = useCallback(async (claim) => {
    searchedClaimRef.current = claim;
    setCiteSearching(true);
    setCiteCandidates([]);
    try {
      const res = await findCitationsAPI(claim, documents.map((d) => d.doc_name), 5);
      setCiteCandidates(res.candidates || []);
    } catch (err) {
      console.error('Failed to search citations:', err);
    } finally {
      setCiteSearching(false);
    }
  }, [documents]);

  // forceTab: 'library' | 'ai'. Default: AI match when text is selected, else the library.
  const openCite = (forceTab) => {
    const ed = editorRef.current;
    const sel = window.getSelection();
    if (ed && sel && sel.rangeCount > 0 && ed.contains(sel.anchorNode)) {
      savedSelectionRange.current = sel.getRangeAt(0).cloneRange();
    }
    const claim = (savedSelectionRange.current?.toString() || '').replace(/\s+/g, ' ').trim();
    const tab = forceTab || (claim ? 'ai' : 'library');
    setBubblePosition(null);
    setIsAskOpen(false);
    setCiteClaim(claim);
    setCiteTab(tab);
    setIsCiteOpen(true);
    if (tab === 'ai' && claim && searchedClaimRef.current !== claim) runCiteSearch(claim);
  };

  const changeCiteTab = (tab) => {
    setCiteTab(tab);
    if (tab === 'ai' && citeClaim && searchedClaimRef.current !== citeClaim) runCiteSearch(citeClaim);
  };

  // One insert for both tabs: the same span.citation-ref[data-citation-id] either way.
  const insertCitation = (src, pageNum) => {
    const ed = editorRef.current;
    if (!ed) return;

    let range = savedSelectionRange.current ? savedSelectionRange.current.cloneRange() : null;
    if (!range || !ed.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(ed);
    }
    range.collapse(false); // after the highlighted sentence
    ed.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const known = citationsRef.current;
    const prunedMax = Array.from(prunedRef.current.values()).reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
    // Ids already used by spans in the document count too, even when their metadata is gone.
    const domMax = Array.from(ed.querySelectorAll('span.citation-ref[data-citation-id]')).reduce(
      (m, el) => Math.max(m, Number(el.dataset.citationId) || 0), 0
    );
    const id = Math.max(prunedMax, domMax, known.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0)) + 1;
    const entry = {
      id,
      doc_name: src.doc_name,
      paper_title: src.paper_title || src.title || src.doc_name,
      authors: src.authors || null,
      year: src.year || null,
      venue: src.venue || null,
      doi: src.doi || null,
      arxiv_id: src.arxiv_id || null,
      url: src.url || null,
      formatted_citation: src.formatted_citation || null,
      chunk_id: src.chunk_id || null,
      excerpt: src.excerpt || null,
      similarity_score: typeof src.similarity_score === 'number' ? src.similarity_score : null,
      page_number: pageNum || src.page_number || null,
      citation_style: styleRef.current,
      timestamp: new Date().toISOString(),
    };
    const sameSource = known.find((c) => (c.doc_name || c.paper_title) === (entry.doc_name || entry.paper_title));
    const provisional = { ...entry, doc_index: sameSource?.doc_index || known.reduce((m, c) => Math.max(m, c.doc_index || 0), 0) + 1 };

    const span = document.createElement('span');
    span.className = 'citation-ref';
    span.dataset.citationId = String(id);
    span.dataset.docName = entry.doc_name || '';
    span.title = [entry.paper_title, entry.authors].filter(Boolean).join(' — ');
    span.style.color = '#1e3a8a';
    span.style.fontWeight = '600';
    span.textContent = inTextLabel(provisional, styleRef.current);

    // No second space when the text after the caret already starts with one.
    const after = range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.data.charAt(range.endOffset)
      : (range.endContainer.childNodes[range.endOffset]?.textContent || '').charAt(0);
    const tail = /\s/.test(after) ? '' : '&nbsp;';

    // Inserted without contenteditable: a non-editable inline node makes the browser hoist it out of
    // the paragraph at the end of a block. It is made atomic once it is in place.
    if (!document.execCommand('insertHTML', false, `${span.outerHTML}${tail}`)) {
      range.insertNode(span);
    }
    const placed = ed.querySelector(`span.citation-ref[data-citation-id="${id}"]`);
    if (placed) placed.contentEditable = 'false';

    const synced = syncCitations(entry);
    updateStats();
    triggerAutoSave(ed.innerHTML, title, synced);
    setIsCiteOpen(false);
    savedSelectionRange.current = null;
  };

  // --------------------------------------------------------------------------
  // Ask AI
  // --------------------------------------------------------------------------
  // The range Ask AI was opened on: Replace and Insert Below act on it, wherever the caret has gone since.
  const askRangeRef = useRef(null);

  const selectRange = (range) => {
    const ed = editorRef.current;
    if (!ed || !range || !ed.contains(range.commonAncestorContainer)) return false;
    ed.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  };

  const closeCite = () => {
    setIsCiteOpen(false);
    restoreEditorSelection();
  };

  const closeAsk = () => {
    setIsAskOpen(false);
    if (!selectRange(askRangeRef.current)) restoreEditorSelection();
  };

  const openAskAI = () => {
    const ed = editorRef.current;
    const sel = window.getSelection();
    if (ed && sel && sel.rangeCount > 0 && ed.contains(sel.anchorNode) && !sel.isCollapsed) {
      savedSelectionRange.current = sel.getRangeAt(0).cloneRange();
    }
    const text = (savedSelectionRange.current?.toString() || selectedText || '').trim();
    if (!text) return;
    askRangeRef.current = savedSelectionRange.current ? savedSelectionRange.current.cloneRange() : null;
    setAskSelection(text);
    setAskResult('');
    setAskThinking('');
    setAskCanApply(true);
    setBubblePosition(null);
    setIsCiteOpen(false);
    setIsAskOpen(true);
  };

  const submitAsk = async (instruction) => {
    setAskLoading(true);
    setAskResult('');
    setAskThinking('');
    try {
      const res = await editorAskAIAPI({
        selection: askSelection,
        instruction,
        docNames: documents.map((d) => d.doc_name),
        modelName: currentModel || null,
      });
      setAskResult(res.result || '');
      setAskThinking(res.thinking_process || '');
      setAskCanApply(!res.blocked);
    } catch {
      setAskResult('The AI assistant could not be reached. Try again.');
      setAskCanApply(false);
    } finally {
      setAskLoading(false);
    }
  };

  const replaceWithAsk = (text) => {
    if (!selectRange(askRangeRef.current)) return; // the original passage is gone: change nothing
    const paras = text.trim().split(/\n{2,}/);
    if (paras.length === 1 && !paras[0].includes('\n')) document.execCommand('insertText', false, text.trim());
    else document.execCommand('insertHTML', false, textToHtml(text.trim()));
    setIsAskOpen(false);
    handleEditorInput();
  };

  const insertBelowWithAsk = (text) => {
    const ed = editorRef.current;
    const saved = askRangeRef.current;
    if (!ed || !saved || !ed.contains(saved.commonAncestorContainer)) return;
    let block = saved.endContainer;
    while (block && block.parentNode !== ed) block = block.parentNode;
    const range = document.createRange();
    if (block) {
      range.setStartAfter(block);
    } else {
      range.selectNodeContents(ed);
      range.collapse(false);
    }
    range.collapse(true);
    ed.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertHTML', false, textToHtml(text.trim()));
    setIsAskOpen(false);
    handleEditorInput();
  };

  // --------------------------------------------------------------------------
  // Find & Replace
  // --------------------------------------------------------------------------
  const openFind = (replace) => {
    const sel = window.getSelection();
    const ed = editorRef.current;
    const picked = ed && sel && !sel.isCollapsed && ed.contains(sel.anchorNode) ? sel.toString() : '';
    setFind((prev) => ({
      replace,
      query: picked && !picked.includes('\n') ? picked : prev?.query || '',
      nonce: (prev?.nonce || 0) + 1,
    }));
  };

  const closeFind = () => {
    setFind(null);
    editorRef.current?.focus();
  };

  // --------------------------------------------------------------------------
  // Paste: keep structure, drop the source's colours (they clash with the white page and the
  // text-colour tool). Plain-text pastes are left to the browser.
  // --------------------------------------------------------------------------
  const handlePaste = (e) => {
    const html = e.clipboardData?.getData('text/html');
    if (!html) return;
    e.preventDefault();
    const doc = new DOMParser().parseFromString(html, 'text/html'); // inert: nothing loads or runs
    doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove());
    doc.body.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((a) => {
        if (a.name.startsWith('on')) el.removeAttribute(a.name);
      });
      el.removeAttribute('color');
      el.removeAttribute('bgcolor');
      if (el.style) {
        el.style.removeProperty('color');
        el.style.removeProperty('background');
        el.style.removeProperty('background-color');
        if (!el.getAttribute('style')) el.removeAttribute('style');
      }
    });
    document.execCommand('insertHTML', false, doc.body.innerHTML);
  };

  // --------------------------------------------------------------------------
  // Keyboard
  // --------------------------------------------------------------------------
  const moveInTable = (ctx, dir) => {
    const cells = Array.from(ctx.table.querySelectorAll('td, th'));
    const target = cells[cells.indexOf(ctx.cell) + dir];
    if (!target) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    // Escape first closes whatever is open; only a bare Escape arms the Escape-then-Tab exit.
    if (e.key === 'Escape') {
      if (openMenu || isCiteOpen || isAskOpen) {
        e.preventDefault();
        if (openMenu) setOpenMenu(null);
        else if (isCiteOpen) closeCite();
        else closeAsk();
        return;
      }
      escPressedRef.current = true;
      return;
    }
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      handleInsertPageBreak();
    } else if (mod && e.shiftKey && key === 'c') {
      e.preventDefault();
      openCite();
    } else if (mod && !e.shiftKey && (key === 'f' || key === 'h')) {
      e.preventDefault();
      openFind(key === 'h');
    } else if (e.key === 'Tab' && !mod && !e.altKey) {
      if (escPressedRef.current) {
        escPressedRef.current = false; // Escape, then Tab, moves focus on
        return;
      }
      e.preventDefault();
      const ctx = getCellContext(editorRef.current);
      if (ctx) moveInTable(ctx, e.shiftKey ? -1 : 1);
      else changeIndent(e.shiftKey ? -1 : 1);
    }
    escPressedRef.current = false;
  };

  // --------------------------------------------------------------------------
  // Export
  // --------------------------------------------------------------------------
  const exportArgs = () => ({
    html: editorRef.current?.innerHTML || '',
    text: editorRef.current?.innerText || '',
    title,
    citations,
    style: citationStyle,
    pageSize,
    fontFamily: currentFont,
  });

  const handleCopyMarkdown = () => {
    if (!editorRef.current) return;
    navigator.clipboard.writeText(markdownText(exportArgs()));
    setCopied(true);
    setOpenMenu(null);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!editorRef.current) return;
    setOpenMenu(null);
    downloadMarkdown(exportArgs());
  };

  const handleExportDocx = async () => {
    if (!editorRef.current) return;
    setOpenMenu(null);
    await exportDocx(exportArgs());
  };

  const handleExportPdf = () => {
    if (!editorRef.current) return;
    setOpenMenu(null);
    exportPdf(exportArgs());
  };

  const bibliography = bibliographyEntries(citations, citationStyle);
  const saveLabel = saveStatus === 'error' ? null : saveStatus === 'saved' ? 'Saved' : 'Saving…';

  return (
    <div className="flex flex-col w-full h-full min-w-0 bg-zinc-950 text-zinc-100 font-sans select-text relative overflow-hidden">
      {loadError && (
        <div role="alert" className="absolute inset-x-0 bottom-0 top-12 z-40 flex flex-col items-center justify-center gap-3 bg-zinc-950 text-sm text-zinc-300">
          <p>Could not open this document.</p>
          <button
            type="button"
            onClick={() => setLoadNonce((n) => n + 1)}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-100 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 1. TOP BAR */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-3.5 py-2 flex items-center justify-between gap-3 select-none shrink-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <FileText className="h-3 w-3" />
            </div>
            <span className="text-xs font-semibold text-zinc-200 tracking-tight">Document</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer font-medium shrink-0"
            title="Copy document as Markdown"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onMouseDown={keepSelection}
              onClick={() => setOpenMenu(openMenu === 'export' ? null : 'export')}
              className="flex items-center gap-1 text-xs text-zinc-200 hover:text-zinc-100 px-2.5 py-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer font-medium shrink-0 bg-zinc-800/70 border border-zinc-700/60 shadow-xs"
              title="Export Document"
              aria-haspopup="true"
              aria-expanded={openMenu === 'export'}
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              <span>Export</span>
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </button>

            {openMenu === 'export' && (
              <div className="absolute top-full right-0 mt-1.5 p-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 w-52 space-y-1">
                <button type="button" onMouseDown={keepSelection} onClick={handleExportDocx} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-blue-400 transition-colors cursor-pointer text-left">
                  <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                  <div>
                    <div className="font-semibold">Microsoft Word (.docx)</div>
                    <div className="text-[10px] text-zinc-400">Formatted Word document</div>
                  </div>
                </button>
                <button type="button" onMouseDown={keepSelection} onClick={handleExportPdf} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-red-400 transition-colors cursor-pointer text-left">
                  <Download className="h-4 w-4 text-red-400 shrink-0" />
                  <div>
                    <div className="font-semibold">PDF Document (.pdf)</div>
                    <div className="text-[10px] text-zinc-400">Printable publication layout</div>
                  </div>
                </button>
                <button type="button" onMouseDown={keepSelection} onClick={handleDownloadMarkdown} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-amber-400 transition-colors cursor-pointer text-left">
                  <FileCode className="h-4 w-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-semibold">Markdown (.md)</div>
                    <div className="text-[10px] text-zinc-400">Clean text synthesis</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title={isFullscreen ? 'Restore Split Screen' : 'Expand to Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
            className={`p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer shrink-0 ${
              isToolbarCollapsed ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 hover:text-zinc-100'
            }`}
            title={isToolbarCollapsed ? 'Show formatting toolbar' : 'Hide formatting toolbar'}
          >
            {isToolbarCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>

          <div className="h-3.5 w-px bg-zinc-800 shrink-0 mx-0.5" />

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
              title="Close Document Writer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. RIBBON: grouped, wraps to a second row instead of clipping in a narrow panel */}
      <div
        className={`relative z-40 shrink-0 ${isToolbarCollapsed ? 'h-0 opacity-0 overflow-hidden pointer-events-none' : 'h-auto opacity-100 overflow-visible'}`}
      >
        <div role="group" aria-label="Formatting" className="bg-zinc-900/60 border-b border-zinc-800 px-3 py-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 select-none text-zinc-300 text-xs overflow-visible">
          <Group label="History">
            <RibbonButton label="Undo" onClick={() => formatDoc('undo')}><Undo2 className="h-3.5 w-3.5" /></RibbonButton>
            <RibbonButton label="Redo" onClick={() => formatDoc('redo')}><Redo2 className="h-3.5 w-3.5" /></RibbonButton>
          </Group>
          <Divider />

          <Group label="Text style">
            <Popover id="block" {...popoverProps} label="Paragraph style" panelClass="w-36 space-y-0.5"
              trigger={<span className="truncate max-w-[80px]">{currentBlockLabel}</span>}>
              {BLOCK_STYLES.map((s) => (
                <button key={s.label} type="button" onMouseDown={keepSelection} onClick={() => handleApplyBlockStyle(s)} className={`${MENU_ITEM} font-medium`}>
                  {s.label}
                </button>
              ))}
            </Popover>
            <Popover id="font" {...popoverProps} label="Font family" panelClass="w-44 space-y-0.5"
              trigger={<span className="truncate max-w-[90px]">{currentFontLabel}</span>}>
              {FONT_FAMILIES.map((f) => (
                <button key={f.label} type="button" onMouseDown={keepSelection} onClick={() => handleApplyFont(f)} className={MENU_ITEM} style={{ fontFamily: f.value }}>
                  {f.label}
                </button>
              ))}
            </Popover>
            <input
              type="number"
              min={MIN_PT}
              max={MAX_PT}
              step={1}
              value={sizeInput}
              onChange={(e) => {
                setSizeInput(e.target.value);
                // Typed characters carry an inputType; a spinner or arrow-key step does not.
                if (e.nativeEvent.inputType) sizeDirtyRef.current = true;
                else commitSize(e.target.value, 'step');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitSize(sizeInput, 'enter');
                }
              }}
              onBlur={() => {
                if (sizeDirtyRef.current) commitSize(sizeInput, 'blur');
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Font size (pt)"
              title="Font size (8 to 36 pt)"
              className="w-12 h-7 px-1.5 bg-zinc-950 border border-zinc-700/70 rounded-lg text-xs text-zinc-100 text-center focus:outline-none focus:border-amber-500/70"
            />
          </Group>
          <Divider />

          <Group label="Character">
            <RibbonButton label="Bold" onClick={() => formatDoc('bold')} className="font-bold text-zinc-300">B</RibbonButton>
            <RibbonButton label="Italic" onClick={() => formatDoc('italic')} className="italic font-serif text-zinc-300">I</RibbonButton>
            <RibbonButton label="Underline" onClick={() => formatDoc('underline')} className="underline text-zinc-300">U</RibbonButton>
            <RibbonButton label="Strikethrough" onClick={() => formatDoc('strikeThrough')} className="line-through text-zinc-300">S</RibbonButton>
            <RibbonButton label="Superscript" onClick={() => formatDoc('superscript')}><Superscript className="h-3.5 w-3.5" /></RibbonButton>
            <RibbonButton label="Subscript" onClick={() => formatDoc('subscript')}><Subscript className="h-3.5 w-3.5" /></RibbonButton>
          </Group>
          <Divider />

          <Group label="Colour">
            <Popover id="color" {...popoverProps} label="Text colour"
              trigger={<span className="font-bold leading-none pb-0.5" style={{ borderBottom: `3px solid ${lastTextColor}` }}>A</span>}>
              <Swatches colors={TEXT_COLORS} prefix="Text colour" onPick={(v) => applyColor('fore', v)}
                onClear={() => applyColor('fore', '#111827')} clearLabel="Automatic" />
            </Popover>
            <Popover id="highlight" {...popoverProps} label="Highlight colour"
              trigger={<span className="flex flex-col items-center"><Highlighter className="h-3.5 w-3.5" /><span className="block h-[3px] w-4 rounded-sm mt-px" style={{ backgroundColor: lastHighlight }} /></span>}>
              <Swatches colors={HIGHLIGHT_COLORS} prefix="Highlight" onPick={(v) => applyColor('back', v)}
                onClear={() => applyColor('back', 'transparent')} clearLabel="No highlight" />
            </Popover>
          </Group>
          <Divider />

          <Group label="Paragraph">
            <Popover id="align" {...popoverProps} label="Text alignment" panelClass="flex items-center gap-1"
              trigger={activeAlign === 'justifyCenter' ? <AlignCenter className="h-3.5 w-3.5" /> : activeAlign === 'justifyRight' ? <AlignRight className="h-3.5 w-3.5" /> : activeAlign === 'justifyFull' ? <AlignJustify className="h-3.5 w-3.5" /> : <AlignLeft className="h-3.5 w-3.5" />}>
              {[
                ['justifyLeft', 'Align left', AlignLeft],
                ['justifyCenter', 'Align center', AlignCenter],
                ['justifyRight', 'Align right', AlignRight],
                ['justifyFull', 'Justify', AlignJustify],
              ].map(([cmd, label, Icon]) => (
                <button key={cmd} type="button" onMouseDown={keepSelection}
                  onClick={() => { formatDoc(cmd); setOpenMenu(null); }}
                  aria-label={label} title={label}
                  className={`p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer ${activeAlign === cmd ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-400 hover:text-zinc-100'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </Popover>
            <Popover id="spacing" {...popoverProps} label="Line spacing" panelClass="w-44"
              trigger={<ArrowUpDown className="h-3.5 w-3.5" />}>
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-500">Line spacing</div>
              {LINE_SPACINGS.map((n) => (
                <button key={n} type="button" onMouseDown={keepSelection} onClick={() => setBlockStyle('lineHeight', String(n))} aria-label={`Line spacing ${n}`} className={MENU_ITEM}>
                  {n.toFixed(n === 1.15 ? 2 : 1)}
                </button>
              ))}
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-500">Space before</div>
              <div className="flex gap-1 px-1 pb-1">
                {SPACE_PT.map((n) => (
                  <button key={n} type="button" onMouseDown={keepSelection} onClick={() => setBlockStyle('marginTop', `${n}pt`)} aria-label={`Space before ${n} pt`} className={`${MENU_ITEM} text-center px-1`}>{n}</button>
                ))}
              </div>
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-zinc-500">Space after</div>
              <div className="flex gap-1 px-1 pb-1">
                {SPACE_PT.map((n) => (
                  <button key={n} type="button" onMouseDown={keepSelection} onClick={() => setBlockStyle('marginBottom', `${n}pt`)} aria-label={`Space after ${n} pt`} className={`${MENU_ITEM} text-center px-1`}>{n}</button>
                ))}
              </div>
            </Popover>
            <RibbonButton label="Decrease indent" onClick={() => changeIndent(-1)}><IndentDecrease className="h-3.5 w-3.5" /></RibbonButton>
            <RibbonButton label="Increase indent" onClick={() => changeIndent(1)}><IndentIncrease className="h-3.5 w-3.5" /></RibbonButton>
            <RibbonButton label="Bullet list" onClick={() => formatDoc('insertUnorderedList')}><List className="h-3.5 w-3.5" /></RibbonButton>
            <RibbonButton label="Numbered list" onClick={() => formatDoc('insertOrderedList')}><ListOrdered className="h-3.5 w-3.5" /></RibbonButton>
          </Group>
          <Divider />

          <Group label="Insert">
            <Popover id="table" {...popoverProps} label="Insert table" panelClass="p-3 w-52"
              trigger={<TableIcon className="h-3.5 w-3.5" />}>
              <TableGrid onPick={handleInsertCustomTable} />
            </Popover>
            <RibbonButton label="Blockquote" onClick={() => formatDoc('quote')}><Quote className="h-3.5 w-3.5" /></RibbonButton>
            <button
              type="button"
              onMouseDown={keepSelection}
              onClick={() => openCite()}
              aria-label="Cite"
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors cursor-pointer shrink-0"
              title="Cite: library or AI match (Ctrl+Shift+C)"
            >
              <BookMarked className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline font-semibold">Cite</span>
            </button>
            <RibbonButton label="Divider" onClick={() => formatDoc('insertHorizontalRule')}><Minus className="h-3.5 w-3.5" /></RibbonButton>
            <RibbonButton label="Page break" onClick={handleInsertPageBreak}><FilePlus className="h-3.5 w-3.5" /></RibbonButton>
          </Group>
          <Divider />

          <Group label="Tools">
            <RibbonButton label="Find and replace" onClick={() => openFind(false)}><Search className="h-3.5 w-3.5" /></RibbonButton>
            <RibbonButton label="Clear formatting" onClick={() => formatDoc('removeFormat')}><RemoveFormatting className="h-3.5 w-3.5" /></RibbonButton>
          </Group>
        </div>

        {/* Table tools: only while the caret is in a table cell */}
        {inTable && (
          <div role="group" aria-label="Table tools" className="bg-zinc-900/80 border-b border-zinc-800 px-3 py-1 flex flex-wrap items-center gap-x-1 gap-y-1 select-none text-xs">
            <span className="flex items-center gap-1 text-[11px] text-zinc-400 mr-1"><TableProperties className="h-3.5 w-3.5" />Table</span>
            <RibbonButton label="Insert row above" onClick={() => doTableOp('row-above')}><Rows3 className="h-3.5 w-3.5" /><span className="ml-1 text-[10px]">Above</span></RibbonButton>
            <RibbonButton label="Insert row below" onClick={() => doTableOp('row-below')}><Rows3 className="h-3.5 w-3.5" /><span className="ml-1 text-[10px]">Below</span></RibbonButton>
            <RibbonButton label="Insert column left" onClick={() => doTableOp('col-left')}><Columns3 className="h-3.5 w-3.5" /><span className="ml-1 text-[10px]">Left</span></RibbonButton>
            <RibbonButton label="Insert column right" onClick={() => doTableOp('col-right')}><Columns3 className="h-3.5 w-3.5" /><span className="ml-1 text-[10px]">Right</span></RibbonButton>
            <Divider />
            <RibbonButton label="Delete row" onClick={() => doTableOp('row-delete')} className="hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /><span className="ml-1 text-[10px]">Row</span></RibbonButton>
            <RibbonButton label="Delete column" onClick={() => doTableOp('col-delete')} className="hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /><span className="ml-1 text-[10px]">Column</span></RibbonButton>
            <Divider />
            <RibbonButton label="Toggle header row" onClick={() => doTableOp('header-toggle')}><span className="text-[10px] px-1">Header row</span></RibbonButton>
            <Popover id="shade" {...popoverProps} label="Shade cell" trigger={<PaintBucket className="h-3.5 w-3.5" />}>
              <div className="p-1.5 w-40 space-y-0.5">
                {SHADE_COLORS.map((c) => (
                  <button key={c.name} type="button" onMouseDown={keepSelection} onClick={() => doTableOp('shade', c.value)} aria-label={`Cell shading ${c.name}`} className={`${MENU_ITEM} flex items-center gap-2`}>
                    <span className="h-3.5 w-3.5 rounded-sm border border-zinc-600 shrink-0" style={{ backgroundColor: c.value || 'transparent' }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </Popover>
          </div>
        )}
      </div>

      {find && (
        <FindReplaceBar
          key={find.nonce}
          editorRef={editorRef}
          initialQuery={find.query}
          showReplace={find.replace}
          contentKey={contentKey}
          onClose={closeFind}
        />
      )}

      {isFullscreen && onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="fixed top-1/2 left-3 -translate-y-1/2 z-50 p-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/60 rounded-full shadow-2xl text-zinc-400 hover:text-zinc-100 transition-all cursor-pointer group"
          title="Restore Split View (Collapse)"
        >
          <ChevronRight className="h-4 w-4 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* 3. CANVAS */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-950 flex justify-center items-start px-2 sm:px-6 py-6 pb-20 relative z-10"
        onMouseUp={handleSelectionChange}
        onKeyUp={handleSelectionChange}
      >
        {bubblePosition && (
          <FloatingBubbleMenu
            position={bubblePosition}
            onCite={() => openCite('ai')}
            onCiteLibrary={() => openCite('library')}
            onAskAI={openAskAI}
            onFormat={(cmd) => formatDoc(cmd)}
            onClose={() => setBubblePosition(null)}
          />
        )}

        <div className="word-canvas-wrapper w-full flex flex-col items-center">
          <div
            ref={canvasRef}
            style={{
              fontFamily: currentFont,
              fontSize: `${baseFontSize}pt`,
              '--page-w': `${page.w}px`,
              '--page-h': `${page.h}px`,
            }}
            className="word-document-canvas"
          >
            <input
              ref={titleRef}
              type="text"
              value={title}
              placeholder="Untitled Academic Paper"
              aria-label="Document title"
              data-writer-title
              onChange={(e) => {
                setTitle(e.target.value);
                triggerAutoSave(editorRef.current?.innerHTML, e.target.value, citationsRef.current);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editorRef.current?.focus();
                }
              }}
              className="w-full text-2xl sm:text-3xl font-bold text-slate-900 border-none outline-none mb-6 pb-2 transition-colors bg-transparent font-serif placeholder:text-slate-400 placeholder:italic"
            />

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Document body"
              onKeyDown={handleKeyDown}
              onBlur={() => { escPressedRef.current = false; }}
              onPaste={handlePaste}
              onInput={handleEditorInput}
              className="academic-editor max-w-none focus:outline-none min-h-[600px] leading-relaxed text-slate-900"
            />

            {/* References: always the live state of the citations model */}
            {bibliography.length > 0 && (
              <div className="mt-20 pt-8 border-t-2 border-slate-300 font-sans select-text not-prose">
                <h2 className="text-xl font-bold text-slate-900 font-serif tracking-tight mb-5">References</h2>
                <ol className="space-y-3 list-none p-0 m-0">
                  {bibliography.map((item) => (
                    <li key={item.key} className="flex items-baseline gap-3 text-sm text-slate-800 leading-relaxed">
                      {item.label && <span className="font-bold text-slate-900 font-serif shrink-0 min-w-[2rem]">{item.label}</span>}
                      <span className="flex-1">
                        {item.parts.map((p, i) => (p.i ? <em key={i}>{p.t}</em> : <span key={i}>{p.t}</span>))}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. STATUS BAR */}
      <div className="bg-zinc-900/90 border-t border-zinc-800/80 px-4 py-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-zinc-400 select-none shrink-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <span className="tabular-nums">
            {stats.words} words · {stats.chars} characters · {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {citations.length} {citations.length === 1 ? 'citation' : 'citations'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div role="group" aria-label="Page size" className="flex items-center bg-zinc-950 p-0.5 rounded-md border border-zinc-800">
            {Object.entries(PAGE_SIZES).map(([id, p]) => (
              <button
                key={id}
                type="button"
                aria-pressed={pageSize === id}
                aria-label={p.label}
                title={`${p.label} page (${p.w} × ${p.h} px)`}
                onClick={() => setPageSize(id)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${pageSize === id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Only a failure is announced to screen readers; "Saved"/"Saving" stay visual. */}
          <div className="min-w-[7rem] text-right">
            {!sourceId ? null : saveStatus === 'error' ? (
              <span role="alert" className="text-red-400">
                Couldn't save.{' '}
                <button type="button" onClick={() => flushNow()} className="underline underline-offset-2 hover:text-red-300 cursor-pointer">
                  Retry
                </button>
              </span>
            ) : (
              <span className={saveStatus === 'saved' ? 'text-zinc-400' : 'text-zinc-300'}>{saveLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* 5. DRAWERS */}
      <CiteDrawer
        isOpen={isCiteOpen}
        onClose={closeCite}
        tab={citeTab}
        onTabChange={changeCiteTab}
        citationStyle={citationStyle}
        onStyleChange={setCitationStyle}
        claim={citeClaim}
        candidates={citeCandidates}
        isSearching={citeSearching}
        onInsertMatch={(candidate) => insertCitation(candidate, null)}
        onInsertLibrary={(paper, pageNum) => insertCitation(paper, pageNum)}
        citations={citations}
        workspaceDocs={documents}
        onOpenPdfViewer={onOpenPdfViewer}
      />

      <InlineAskAIDrawer
        isOpen={isAskOpen}
        onClose={closeAsk}
        selection={askSelection}
        onSubmitPrompt={submitAsk}
        isLoading={askLoading}
        aiResult={askResult}
        thinkingProcess={askThinking}
        canApply={askCanApply}
        onReplaceSelection={replaceWithAsk}
        onInsertBelow={insertBelowWithAsk}
      />
    </div>
  );
}
