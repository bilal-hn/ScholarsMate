import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Indent,
  Outdent,
  RemoveFormatting,
  Palette,
  Highlighter,
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FileText,
  Clock,
  ExternalLink,
  X
} from 'lucide-react';
import FloatingBubbleMenu from './FloatingBubbleMenu';
import CitationDrawer from './CitationDrawer';
import InlineAskAIDrawer from './InlineAskAIDrawer';
import { getDraftAPI, saveDraftAPI, findCitationsAPI, editorAskAIAPI } from '../../services/api';

const FONT_FAMILIES = [
  { label: 'Source Serif', value: "'Source Serif 4', 'Source Serif Pro', Georgia, serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Georgia', value: "Georgia, serif" },
  { label: 'EB Garamond', value: "'EB Garamond', Garamond, serif" },
  { label: 'Merriweather', value: "Merriweather, Georgia, serif" },
  { label: 'Calibri', value: "Calibri, Candara, Segoe, sans-serif" },
  { label: 'Arial', value: "Arial, Helvetica, sans-serif" },
  { label: 'Inter', value: "Inter, system-ui, sans-serif" },
  { label: 'Roboto', value: "Roboto, sans-serif" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
];

const FONT_SIZES = [
  { label: '8', pt: 8 },
  { label: '9', pt: 9 },
  { label: '10', pt: 10 },
  { label: '11', pt: 11 },
  { label: '12', pt: 12 },
  { label: '14', pt: 14 },
  { label: '16', pt: 16 },
  { label: '18', pt: 18 },
  { label: '20', pt: 20 },
  { label: '24', pt: 24 },
  { label: '28', pt: 28 },
  { label: '32', pt: 32 },
  { label: '36', pt: 36 },
];

const HEADING_STYLES = [
  { label: 'Normal text', value: 'p' },
  { label: 'Title', value: 'h1' },
  { label: 'Heading 1', value: 'h1' },
  { label: 'Heading 2', value: 'h2' },
  { label: 'Heading 3', value: 'h3' },
  { label: 'Subtitle', value: 'h4' },
];

const TEXT_COLORS = [
  { label: 'Black', color: '#18181b' },
  { label: 'Dark Gray', color: '#52525b' },
  { label: 'Academic Blue', color: '#1d4ed8' },
  { label: 'Crimson Red', color: '#b91c1c' },
  { label: 'Forest Green', color: '#15803d' },
  { label: 'Purple', color: '#7e22ce' },
  { label: 'Amber', color: '#b45309' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', color: 'transparent' },
  { label: 'Yellow', color: '#fef08a' },
  { label: 'Light Green', color: '#bbf7d0' },
  { label: 'Light Cyan', color: '#a5f3fc' },
  { label: 'Light Pink', color: '#fbcfe8' },
  { label: 'Light Amber', color: '#fed7aa' },
];

export default function DocumentWriter({
  sessionId,
  documents = [],
  availableModels = [],
  currentModel = '',
  onOpenPdfViewer,
  isFullscreen = false,
  onToggleFullscreen,
  onClose,
}) {
  const editorRef = useRef(null);
  const [title, setTitle] = useState('Fyp');
  const [citations, setCitations] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved'
  const [wordCount, setWordCount] = useState(82);
  const [copied, setCopied] = useState(false);

  // Top Toolbar Collapse State
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);

  // Word Typography State
  const [currentFont, setCurrentFont] = useState("'Source Serif 4', 'Source Serif Pro', Georgia, serif");
  const [currentFontSize, setCurrentFontSize] = useState(12);
  const [currentHeading, setCurrentHeading] = useState('p');
  const [activeAlign, setActiveAlign] = useState('justifyLeft');
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [isHighlightMenuOpen, setIsHighlightMenuOpen] = useState(false);

  // Selection & Bubble Menu State
  const [bubblePosition, setBubblePosition] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const savedSelectionRange = useRef(null);

  // Drawers State
  const [isCitationDrawerOpen, setIsCitationDrawerOpen] = useState(false);
  const [isCitationLoading, setIsCitationLoading] = useState(false);
  const [citationCandidates, setCitationCandidates] = useState([]);

  const [isAskAIDrawerOpen, setIsAskAIDrawerOpen] = useState(false);
  const [isAskAILoading, setIsAskAILoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [thinkingProcess, setThinkingProcess] = useState('');

  // --------------------------------------------------------------------------
  // 1. DRAFT INITIALIZATION & SESSION PERSISTENCE
  // --------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    const loadDraft = async () => {
      if (!sessionId) return;
      try {
        const draft = await getDraftAPI(sessionId);
        if (draft && isMounted) {
          setTitle(draft.title || 'Fyp');
          setCitations(Array.isArray(draft.citations_data) ? draft.citations_data : []);
          if (editorRef.current) {
            editorRef.current.innerHTML = draft.content_html || `
              <p class="section-tag" style="font-family: Inter, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #71717a; text-transform: uppercase; margin-top: 1.5rem; margin-bottom: 0.75rem;">RELATED WORK</p>
              <ul>
                <li><strong>Structure Extraction Complexities:</strong> Preserving complex document elements—such as embedded multi-column tables, mathematical formulas, and structural headers—during vector chunking remains technically non-trivial <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.5</strong></span>.</li>
                <li><strong>Context Scope Dependency:</strong> Retrieval performance is fundamentally bounded by the granularity of chunking algorithms and vector embedding quality <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.5</strong></span> <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.8</strong></span>.</li>
              </ul>
              <h2 style="font-family: 'Source Serif 4', Georgia, serif; font-size: 18px; font-weight: 700; margin-top: 2rem; margin-bottom: 0.75rem; color: #111827;">7. Main Conclusion & Future Directions</h2>
              <p>The proposed ScholarsMate assistant offers a tailored framework for academic research synthesis by integrating structural parsing with modular Retrieval-Augmented Generation <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.5</strong></span> <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.8</strong></span>. Selecting a claim anywhere in this document surfaces a quiet inline prompt to cite it or ask the assistant <span data-citation-id="1" class="inline-citation-marker" style="font-family: monospace; font-size: 11px; font-weight: 600; color: #0d9488; background: #f0fdfa; border: 1px solid #5eead4; padding: 2px 6px; border-radius: 4px; cursor: pointer;">[1]</span> — no separate panel required.</p>
              <p class="section-tag" style="font-family: Inter, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #71717a; text-transform: uppercase; margin-top: 2rem; margin-bottom: 0.75rem;">PLANNED IMPLEMENTATION TIMELINE</p>
              <p></p>
            `;
            updateWordCount();
          }
          setSaveStatus('saved');
        }
      } catch (err) {
        console.error('Error loading draft:', err);
      }
    };

    loadDraft();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  // Debounced auto-save timer
  const autoSaveTimerRef = useRef(null);

  const triggerAutoSave = useCallback((newHtml, newTitle, newCitations) => {
    setSaveStatus('unsaved');
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      if (!sessionId) return;
      setSaveStatus('saving');
      try {
        const htmlToSave = newHtml !== undefined ? newHtml : (editorRef.current ? editorRef.current.innerHTML : '');
        const titleToSave = newTitle !== undefined ? newTitle : title;
        const citationsToSave = newCitations !== undefined ? newCitations : citations;

        await saveDraftAPI({
          session_id: sessionId,
          title: titleToSave,
          content_html: htmlToSave,
          content_markdown: htmlToSave,
          citations_data: citationsToSave,
        });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to auto-save draft:', err);
        setSaveStatus('unsaved');
      }
    }, 1200);
  }, [sessionId, title, citations]);

  // --------------------------------------------------------------------------
  // 2. SELECTION DETECTION & FLOATING BUBBLE MENU
  // --------------------------------------------------------------------------
  const updateWordCount = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  };

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

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setBubblePosition({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    } else {
      setBubblePosition(null);
    }
  };

  const restoreSelection = () => {
    if (savedSelectionRange.current) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSelectionRange.current);
    }
  };

  // --------------------------------------------------------------------------
  // 3. WORD-STYLE FORMATTING ACTIONS
  // --------------------------------------------------------------------------
  const formatDoc = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();

    if (command === 'h1') {
      document.execCommand('formatBlock', false, '<h1>');
      setCurrentHeading('h1');
    } else if (command === 'h2') {
      document.execCommand('formatBlock', false, '<h2>');
      setCurrentHeading('h2');
    } else if (command === 'h3') {
      document.execCommand('formatBlock', false, '<h3>');
      setCurrentHeading('h3');
    } else if (command === 'h4') {
      document.execCommand('formatBlock', false, '<h4>');
      setCurrentHeading('h4');
    } else if (command === 'p') {
      document.execCommand('formatBlock', false, '<p>');
      setCurrentHeading('p');
    } else if (command === 'quote') {
      document.execCommand('formatBlock', false, '<blockquote>');
    } else {
      document.execCommand(command, false, value);
      if (['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
        setActiveAlign(command);
      }
    }

    updateWordCount();
    triggerAutoSave();
  };

  const handleApplyFont = (fontValue) => {
    setCurrentFont(fontValue);
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();
    document.execCommand('fontName', false, fontValue);
    triggerAutoSave();
  };

  const handleApplyFontSize = (sizePt) => {
    setCurrentFontSize(sizePt);
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();

    const selection = window.getSelection();
    if (!selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.style.fontSize = `${sizePt}pt`;
      try {
        range.surroundContents(span);
      } catch {
        document.execCommand('fontSize', false, '3');
      }
    }
    triggerAutoSave();
  };

  const handleApplyTextColor = (color) => {
    setIsColorMenuOpen(false);
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();
    document.execCommand('foreColor', false, color);
    triggerAutoSave();
  };

  const handleApplyHighlightColor = (color) => {
    setIsHighlightMenuOpen(false);
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();
    document.execCommand('hiliteColor', false, color);
    triggerAutoSave();
  };

  // --------------------------------------------------------------------------
  // 4. SEMANTIC CITATION ENGINE FLOW
  // --------------------------------------------------------------------------
  const handleOpenCitationSearch = async () => {
    const claim = selectedText;
    if (!claim) return;

    setBubblePosition(null);
    setIsCitationDrawerOpen(true);
    setIsCitationLoading(true);
    setCitationCandidates([]);

    try {
      const docNames = documents.map((d) => d.doc_name);
      const res = await findCitationsAPI(claim, docNames, 5);
      setCitationCandidates(res.candidates || []);
    } catch (err) {
      console.error('Failed to search citations:', err);
    } finally {
      setIsCitationLoading(false);
    }
  };

  const handleInsertCitation = (candidate) => {
    restoreSelection();
    editorRef.current.focus();

    const nextIndex = citations.length + 1;
    const newCitationEntry = {
      id: nextIndex,
      chunk_id: candidate.chunk_id,
      doc_name: candidate.doc_name,
      page_number: candidate.page_number,
      excerpt: candidate.excerpt,
      similarity_score: candidate.similarity_score,
      timestamp: new Date().toISOString(),
    };

    const updatedCitations = [...citations, newCitationEntry];
    setCitations(updatedCitations);

    // Insert inline citation pill [N] in teal style
    const citationHtml = `&nbsp;<span data-citation-id="${nextIndex}" class="inline-citation-marker" style="font-family: monospace; font-size: 11px; font-weight: 600; color: #0d9488; background: #f0fdfa; border: 1px solid #5eead4; padding: 2px 6px; border-radius: 4px; cursor: pointer; select: none;" title="${candidate.doc_name} (Page ${candidate.page_number})">[${nextIndex}]</span>&nbsp;`;
    document.execCommand('insertHTML', false, citationHtml);

    setIsCitationDrawerOpen(false);
    updateWordCount();
    triggerAutoSave(editorRef.current.innerHTML, title, updatedCitations);
  };

  // --------------------------------------------------------------------------
  // 5. IN-EDITOR ASK AI FLOW
  // --------------------------------------------------------------------------
  const handleOpenAskAI = () => {
    setBubblePosition(null);
    setIsAskAIDrawerOpen(true);
    setAiResult('');
    setThinkingProcess('');
  };

  const handleSubmitAskAIPrompt = async (instruction) => {
    if (!selectedText || !instruction) return;
    setIsAskAILoading(true);
    setAiResult('');
    setThinkingProcess('');

    try {
      const docNames = documents.map((d) => d.doc_name);
      const res = await editorAskAIAPI({
        selection: selectedText,
        instruction: instruction,
        docNames: docNames,
        modelName: currentModel,
      });

      setAiResult(res.result || '');
      setThinkingProcess(res.thinking_process || '');
    } catch (err) {
      console.error('In-editor AI error:', err);
      setAiResult('⚠️ Failed to generate AI assistance. Please check backend connection.');
    } finally {
      setIsAskAILoading(false);
    }
  };

  const handleReplaceSelection = (replacementText) => {
    restoreSelection();
    editorRef.current.focus();
    document.execCommand('insertText', false, replacementText);
    setIsAskAIDrawerOpen(false);
    updateWordCount();
    triggerAutoSave();
  };

  const handleInsertBelow = (insertionText) => {
    restoreSelection();
    editorRef.current.focus();
    const formattedHtml = `<p>${insertionText}</p>`;
    document.execCommand('insertHTML', false, formattedHtml);
    setIsAskAIDrawerOpen(false);
    updateWordCount();
    triggerAutoSave();
  };

  // --------------------------------------------------------------------------
  // 6. EXPORT & COPY UTILITIES
  // --------------------------------------------------------------------------
  const handleCopyMarkdown = () => {
    if (!editorRef.current) return;
    const plainText = editorRef.current.innerText || '';
    
    let fullExport = `# ${title}\n\n${plainText}\n\n---\n\n## References\n\n`;
    citations.forEach((c) => {
      fullExport += `[${c.id}] ${c.doc_name}, Page ${c.page_number} — "${c.excerpt}"\n`;
    });

    navigator.clipboard.writeText(fullExport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!editorRef.current) return;
    const plainText = editorRef.current.innerText || '';
    let fullExport = `# ${title}\n\n${plainText}\n\n---\n\n## References\n\n`;
    citations.forEach((c) => {
      fullExport += `[${c.id}] ${c.doc_name}, Page ${c.page_number} — "${c.excerpt}"\n`;
    });

    const blob = new Blob([fullExport], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'academic_draft'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`flex flex-col h-full bg-[#121316] text-zinc-100 font-sans select-text relative overflow-hidden ${
      isFullscreen ? 'w-full h-full' : 'w-full h-full'
    }`}>
      {/* -------------------------------------------------------------------- */}
      {/* 1. COLLAPSIBLE TOP RIBBON TOOLBAR (Scrollable single line)            */}
      {/* -------------------------------------------------------------------- */}
      <div
        className={`relative z-30 transition-all duration-300 ease-in-out shrink-0 ${
          isToolbarCollapsed ? 'h-0 opacity-0 overflow-hidden pointer-events-none' : 'h-auto opacity-100'
        }`}
      >
        <div className="bg-[#18191c] border-b border-[#282a2e] px-4 py-2 flex items-center justify-between gap-3 select-none shadow-xl text-zinc-300 text-xs flex-nowrap overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {/* Left Formats Cluster (All on one single horizontal row) */}
          <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
            {/* Undo / Redo */}
            <button
              type="button"
              onClick={() => formatDoc('undo')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('redo')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* Font Family Dropdown */}
            <div className="relative flex items-center shrink-0">
              <select
                value={currentFont}
                onChange={(e) => handleApplyFont(e.target.value)}
                className="appearance-none bg-transparent hover:bg-[#282a2e] text-zinc-200 text-xs rounded px-2.5 py-1.5 pr-6 border border-transparent hover:border-zinc-700 focus:outline-none cursor-pointer"
                title="Font Family"
              >
                {FONT_FAMILIES.map((f, i) => (
                  <option key={i} value={f.value} className="bg-zinc-900 text-zinc-100">
                    {f.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-zinc-400 absolute right-1.5 pointer-events-none" />
            </div>

            {/* Font Size Dropdown */}
            <div className="relative flex items-center shrink-0">
              <select
                value={currentFontSize}
                onChange={(e) => handleApplyFontSize(Number(e.target.value))}
                className="appearance-none bg-transparent hover:bg-[#282a2e] text-zinc-200 text-xs rounded px-2 py-1.5 pr-5 border border-transparent hover:border-zinc-700 focus:outline-none cursor-pointer w-12 text-center"
                title="Font Size"
              >
                {FONT_SIZES.map((s, i) => (
                  <option key={i} value={s.pt} className="bg-zinc-900 text-zinc-100">
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-zinc-400 absolute right-1 pointer-events-none" />
            </div>

            {/* Heading Style Dropdown */}
            <div className="relative flex items-center shrink-0">
              <select
                value={currentHeading}
                onChange={(e) => formatDoc(e.target.value)}
                className="appearance-none bg-transparent hover:bg-[#282a2e] text-zinc-200 text-xs rounded px-2.5 py-1.5 pr-6 border border-transparent hover:border-zinc-700 focus:outline-none cursor-pointer font-medium"
                title="Styles"
              >
                {HEADING_STYLES.map((h, i) => (
                  <option key={i} value={h.value} className="bg-zinc-900 text-zinc-100">
                    {h.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-zinc-400 absolute right-1.5 pointer-events-none" />
            </div>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* B, I, U, S, x2, x_2 */}
            <button
              type="button"
              onClick={() => formatDoc('bold')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 font-bold transition-colors cursor-pointer shrink-0"
              title="Bold (Ctrl+B)"
            >
              <span className="font-bold text-xs">B</span>
            </button>
            <button
              type="button"
              onClick={() => formatDoc('italic')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 italic transition-colors cursor-pointer shrink-0"
              title="Italic (Ctrl+I)"
            >
              <span className="italic font-serif text-xs">I</span>
            </button>
            <button
              type="button"
              onClick={() => formatDoc('underline')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 underline transition-colors cursor-pointer shrink-0"
              title="Underline (Ctrl+U)"
            >
              <span className="underline text-xs">U</span>
            </button>
            <button
              type="button"
              onClick={() => formatDoc('strikeThrough')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 line-through transition-colors cursor-pointer shrink-0"
              title="Strikethrough"
            >
              <span className="line-through text-xs">S</span>
            </button>

            <button
              type="button"
              onClick={() => formatDoc('superscript')}
              className="px-1.5 py-1 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 font-mono text-[11px] transition-colors cursor-pointer shrink-0"
              title="Superscript (x²)"
            >
              x²
            </button>
            <button
              type="button"
              onClick={() => formatDoc('subscript')}
              className="px-1.5 py-1 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 font-mono text-[11px] transition-colors cursor-pointer shrink-0"
              title="Subscript (x₂)"
            >
              x₂
            </button>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* Colors */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsColorMenuOpen(!isColorMenuOpen)}
                className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Text Color"
              >
                <Palette className="h-3.5 w-3.5" />
              </button>
              {isColorMenuOpen && (
                <div className="absolute top-full left-0 mt-1 p-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 w-36 space-y-1">
                  {TEXT_COLORS.map((tc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyTextColor(tc.color)}
                      className="w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 hover:bg-zinc-800 text-zinc-200"
                    >
                      <span className="h-3 w-3 rounded-full shrink-0 border border-zinc-600" style={{ backgroundColor: tc.color }} />
                      <span className="truncate">{tc.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsHighlightMenuOpen(!isHighlightMenuOpen)}
                className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Highlight Color"
              >
                <Highlighter className="h-3.5 w-3.5 text-yellow-400" />
              </button>
              {isHighlightMenuOpen && (
                <div className="absolute top-full left-0 mt-1 p-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 w-36 space-y-1">
                  {HIGHLIGHT_COLORS.map((hc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyHighlightColor(hc.color)}
                      className="w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 hover:bg-zinc-800 text-zinc-200"
                    >
                      <span className="h-3 w-3 rounded shrink-0 border border-zinc-600" style={{ backgroundColor: hc.color }} />
                      <span className="truncate">{hc.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* Alignments (Left active by default in teal block style) */}
            <button
              type="button"
              onClick={() => formatDoc('justifyLeft')}
              className={`p-1.5 rounded transition-colors cursor-pointer shrink-0 ${
                activeAlign === 'justifyLeft'
                  ? 'bg-teal-950/80 text-teal-400 border border-teal-500/30'
                  : 'hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100'
              }`}
              title="Align Left"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('justifyCenter')}
              className={`p-1.5 rounded transition-colors cursor-pointer shrink-0 ${
                activeAlign === 'justifyCenter'
                  ? 'bg-teal-950/80 text-teal-400 border border-teal-500/30'
                  : 'hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100'
              }`}
              title="Align Center"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('justifyRight')}
              className={`p-1.5 rounded transition-colors cursor-pointer shrink-0 ${
                activeAlign === 'justifyRight'
                  ? 'bg-teal-950/80 text-teal-400 border border-teal-500/30'
                  : 'hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100'
              }`}
              title="Align Right"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('justifyFull')}
              className={`p-1.5 rounded transition-colors cursor-pointer shrink-0 ${
                activeAlign === 'justifyFull'
                  ? 'bg-teal-950/80 text-teal-400 border border-teal-500/30'
                  : 'hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100'
              }`}
              title="Justify"
            >
              <AlignJustify className="h-3.5 w-3.5" />
            </button>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* Bullet & Numbered List */}
            <button
              type="button"
              onClick={() => formatDoc('insertUnorderedList')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Bullet List"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('insertOrderedList')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Numbered List"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('outdent')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Decrease Indent"
            >
              <Outdent className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('indent')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Increase Indent"
            >
              <Indent className="h-3.5 w-3.5" />
            </button>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* Clear Formatting */}
            <button
              type="button"
              onClick={() => formatDoc('removeFormat')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer flex items-center shrink-0"
              title="Clear Formatting"
            >
              <RemoveFormatting className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Right Status & Actions Cluster */}
          <div className="flex items-center gap-3 flex-nowrap shrink-0 ml-auto pl-2">
            {/* Auto-save Status */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-medium select-none shrink-0">
              <span
                className={`h-2 w-2 rounded-full ${
                  saveStatus === 'saved'
                    ? 'bg-emerald-400'
                    : saveStatus === 'saving'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-zinc-500'
                }`}
              />
              <span>{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}</span>
            </div>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded hover:bg-[#282a2e] transition-colors cursor-pointer font-medium shrink-0"
              title="Copy as Markdown"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Export Button */}
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded hover:bg-[#282a2e] transition-colors cursor-pointer font-medium shrink-0"
              title="Export as .md document"
            >
              <Download className="h-3.5 w-3.5 text-zinc-400" />
              <span>Export</span>
            </button>

            {/* Fullscreen Expand / Restore Button */}
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
                title={isFullscreen ? 'Restore Split Screen' : 'Expand to Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Center Toolbar Collapse Tab (Fixed to stay accessible when collapsed) */}
      <button
        type="button"
        onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
        className={`fixed left-1/2 -translate-x-1/2 bg-[#18191c] hover:bg-[#282a2e] border border-[#282a2e] border-t-0 rounded-b-md px-3.5 py-0.5 text-zinc-400 hover:text-zinc-200 shadow-xl cursor-pointer transition-all duration-300 z-50 ${
          isToolbarCollapsed ? 'top-0' : 'top-[41px]'
        }`}
        title={isToolbarCollapsed ? 'Show Toolbar' : 'Collapse Toolbar'}
      >
        {isToolbarCollapsed ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )}
      </button>

      {/* -------------------------------------------------------------------- */}
      {/* 2. PROTRUDING EDGE TAB ARROW                                         */}
      {/* -------------------------------------------------------------------- */}
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className={`z-40 text-zinc-400 hover:text-zinc-100 transition-all cursor-pointer group ${
            isFullscreen
              ? 'fixed top-1/2 left-3 -translate-y-1/2 p-2 bg-[#1e2024]/90 hover:bg-[#282a2e] border border-zinc-700/60 rounded-full shadow-2xl'
              : 'absolute top-1/2 -translate-y-1/2 -left-3.5 p-1.5 bg-[#18191c] hover:bg-[#282a2e] border border-zinc-700 rounded-full shadow-2xl'
          }`}
          title={isFullscreen ? 'Restore Split View (Collapse)' : 'Expand to Fullscreen'}
        >
          {isFullscreen ? (
            <ChevronRight className="h-4 w-4 group-hover:scale-110 transition-transform" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
          )}
        </button>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 3. SCROLLABLE DOCUMENT CANVAS CONTAINER (Light Paper Sheet)          */}
      {/* -------------------------------------------------------------------- */}
      <div
        className={`flex-1 overflow-y-auto bg-[#121316] flex justify-center pb-16 transition-all duration-300 ${
          isToolbarCollapsed ? 'pt-4 sm:pt-6' : 'pt-2 sm:pt-4'
        } px-4`}
        onMouseUp={handleSelectionChange}
        onKeyUp={handleSelectionChange}
      >
        {/* Floating Bubble Menu over text selection */}
        {bubblePosition && (
          <FloatingBubbleMenu
            position={bubblePosition}
            onCite={handleOpenCitationSearch}
            onAskAI={handleOpenAskAI}
            onFormat={(cmd) => formatDoc(cmd)}
            onClose={() => setBubblePosition(null)}
          />
        )}

        {/* Paper Sheet Canvas (Moves up smoothly when toolbar collapses) */}
        <div
          style={{
            fontFamily: currentFont,
            fontSize: `${currentFontSize}pt`,
          }}
          className="w-full max-w-[800px] min-h-[1050px] bg-white text-[#1a1a1a] shadow-2xl rounded-xs p-12 sm:p-20 flex flex-col justify-between transition-all mt-2 mb-10"
        >
          <div>
            {/* Document Title Header (Fyp) */}
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                triggerAutoSave(editorRef.current?.innerHTML, e.target.value, citations);
              }}
              placeholder="Document Title"
              className="w-full text-3xl sm:text-4xl font-bold text-zinc-900 placeholder-zinc-400 border-none outline-none mb-4 pb-1 transition-colors bg-transparent font-serif"
            />

            {/* Rich Contenteditable Body */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                updateWordCount();
                triggerAutoSave(editorRef.current?.innerHTML, title, citations);
              }}
              className="prose prose-zinc max-w-none focus:outline-none min-h-[600px] leading-relaxed text-[#1a1a1a]"
              style={{
                outline: 'none',
              }}
            />
          </div>

          {/* References & Bibliography Section (if any citations exist) */}
          {citations && citations.length > 0 && (
            <div className="mt-14 pt-8 border-t-2 border-zinc-200 font-sans text-xs text-zinc-700 select-text not-prose">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-sans">
                  References & Bibliography
                </h3>
                <span className="text-[11px] font-mono text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                  {citations.length} Cited Sources
                </span>
              </div>

              <div className="space-y-3">
                {citations.map((cite) => (
                  <div
                    key={cite.id}
                    id={`reference-${cite.id}`}
                    className="p-3 bg-zinc-50 hover:bg-zinc-100/80 rounded-lg border border-zinc-200 transition-colors flex items-start justify-between gap-3 group"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="font-mono font-bold text-teal-700 shrink-0 text-xs mt-0.5">
                        [{cite.id}]
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-zinc-900 text-xs truncate">
                            {cite.doc_name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-600 bg-zinc-200 px-1.5 py-0.2 rounded">
                            Page {cite.page_number}
                          </span>
                          {cite.similarity_score && (
                            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                              {Math.round(cite.similarity_score * 100)}% match
                            </span>
                          )}
                        </div>
                        <p className="text-[11.5px] text-zinc-600 italic mt-1 line-clamp-2 leading-relaxed">
                          "{cite.excerpt}"
                        </p>
                      </div>
                    </div>

                    {onOpenPdfViewer && (
                      <button
                        type="button"
                        onClick={() => onOpenPdfViewer(cite.doc_name, cite.page_number)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-teal-700 hover:bg-zinc-200 transition-colors shrink-0 cursor-pointer opacity-80 group-hover:opacity-100"
                        title={`View ${cite.doc_name} at Page ${cite.page_number}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 4. BOTTOM METRICS FOOTER (Matches Screenshot)                        */}
      {/* -------------------------------------------------------------------- */}
      <div className="bg-[#121316] border-t border-[#24262b] px-6 py-2.5 flex items-center justify-between text-xs text-zinc-400 select-none shrink-0 fixed bottom-0 left-0 right-0 z-20">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-zinc-500" />
          <span>{wordCount} words · ~{Math.max(1, Math.ceil(wordCount / 200))} min read</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span>Select a claim to <strong className="text-zinc-200 font-semibold">Cite</strong> or <strong className="text-zinc-200 font-semibold">Ask AI</strong></span>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 5. SLIDE-OVER DRAWERS                                                */}
      {/* -------------------------------------------------------------------- */}
      <CitationDrawer
        isOpen={isCitationDrawerOpen}
        onClose={() => setIsCitationDrawerOpen(false)}
        query={selectedText}
        candidates={citationCandidates}
        isLoading={isCitationLoading}
        onInsertCitation={handleInsertCitation}
        onOpenPdfViewer={onOpenPdfViewer}
      />

      <InlineAskAIDrawer
        isOpen={isAskAIDrawerOpen}
        onClose={() => setIsAskAIDrawerOpen(false)}
        selection={selectedText}
        onSubmitPrompt={handleSubmitAskAIPrompt}
        isLoading={isAskAILoading}
        aiResult={aiResult}
        thinkingProcess={thinkingProcess}
        onReplaceSelection={handleReplaceSelection}
        onInsertBelow={handleInsertBelow}
      />
    </div>
  );
}
