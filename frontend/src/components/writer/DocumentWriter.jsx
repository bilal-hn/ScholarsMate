import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Sparkles,
  BookmarkPlus,
  Undo,
  Redo,
  Save,
  Download,
  Copy,
  Check,
  FileText,
  Clock,
  Eye,
  Trash2,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import FloatingBubbleMenu from './FloatingBubbleMenu';
import CitationDrawer from './CitationDrawer';
import InlineAskAIDrawer from './InlineAskAIDrawer';
import { getDraftAPI, saveDraftAPI, findCitationsAPI, editorAskAIAPI } from '../../services/api';

/**
 * Assisted Academic Document Writer & Citation Engine (FR-13).
 * A Word-like rich document editor with real-time semantic citation verification,
 * inline Ask AI assistance, and dynamic automated bibliography sync.
 */
export default function DocumentWriter({
  sessionId,
  documents = [],
  availableModels = [],
  currentModel = '',
  onOpenPdfViewer,
}) {
  const editorRef = useRef(null);
  const [title, setTitle] = useState('Untitled Academic Draft');
  const [citations, setCitations] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved'
  const [wordCount, setWordCount] = useState(0);
  const [copied, setCopied] = useState(false);

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
          setTitle(draft.title || 'Untitled Academic Draft');
          setCitations(Array.isArray(draft.citations_data) ? draft.citations_data : []);
          if (editorRef.current) {
            editorRef.current.innerHTML = draft.content_html || '<h2>Executive Abstract</h2><p>Start writing your literature review or academic synthesis here...</p>';
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
          content_markdown: htmlToSave, // HTML is fully valid in modern markdown engines
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

    // Ensure selection is inside editor container
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
  // 3. WORD-STYLE FORMATTING ACTIONS (execCommand)
  // --------------------------------------------------------------------------
  const formatDoc = (command, value = null) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();

    if (command === 'h1') {
      document.execCommand('formatBlock', false, '<h1>');
    } else if (command === 'h2') {
      document.execCommand('formatBlock', false, '<h2>');
    } else if (command === 'h3') {
      document.execCommand('formatBlock', false, '<h3>');
    } else if (command === 'p') {
      document.execCommand('formatBlock', false, '<p>');
    } else if (command === 'quote') {
      document.execCommand('formatBlock', false, '<blockquote>');
    } else {
      document.execCommand(command, false, value);
    }

    updateWordCount();
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

    // Insert inline citation pill [N] at cursor
    const citationHtml = `&nbsp;<span data-citation-id="${nextIndex}" class="inline-citation-marker font-mono font-semibold text-amber-600 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded px-1.5 py-0.5 text-xs select-none cursor-pointer transition-colors" title="${candidate.doc_name} (Page ${candidate.page_number})">[${nextIndex}]</span>&nbsp;`;
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
    
    // Append bibliography list to plain text export
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
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 font-sans select-text relative overflow-hidden">
      {/* -------------------------------------------------------------------- */}
      {/* WORD-STYLE TOP STICKY RIBBON TOOLBAR                                 */}
      {/* -------------------------------------------------------------------- */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex items-center justify-between gap-2 shrink-0 select-none shadow-md z-20 flex-wrap">
        {/* Left Formatting Group */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* Undo / Redo */}
          <button
            type="button"
            onClick={() => formatDoc('undo')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('redo')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Redo (Ctrl+Y)"
          >
            <Redo className="h-4 w-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Heading Select */}
          <button
            type="button"
            onClick={() => formatDoc('h1')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer font-bold text-xs"
            title="Heading 1"
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => formatDoc('h2')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer font-bold text-xs"
            title="Heading 2"
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => formatDoc('h3')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer font-bold text-xs"
            title="Heading 3"
          >
            H3
          </button>
          <button
            type="button"
            onClick={() => formatDoc('p')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer text-xs"
            title="Normal Paragraph"
          >
            ¶
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Bold, Italic, Underline, Strikethrough */}
          <button
            type="button"
            onClick={() => formatDoc('bold')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('italic')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('underline')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Underline (Ctrl+U)"
          >
            <Underline className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('strikeThrough')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Strikethrough"
          >
            <Strikethrough className="h-4 w-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Lists & Quotes */}
          <button
            type="button"
            onClick={() => formatDoc('insertUnorderedList')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('insertOrderedList')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Numbered List"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc('quote')}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Blockquote"
          >
            <Quote className="h-4 w-4" />
          </button>
        </div>

        {/* Right AI & Export Group */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live Auto-Save Status */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono px-2 py-1 bg-zinc-950/60 rounded-lg border border-zinc-800">
            <span
              className={`h-2 w-2 rounded-full ${
                saveStatus === 'saved'
                  ? 'bg-emerald-500'
                  : saveStatus === 'saving'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-zinc-600'
              }`}
            />
            <span>{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}</span>
          </div>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Copy Markdown */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer"
            title="Copy as clean Markdown"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Download Markdown */}
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer"
            title="Export as .md file"
          >
            <Download className="h-3.5 w-3.5 text-amber-400" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* SCROLLABLE DOCUMENT CANVAS CONTAINER (Light Paper Sheet on Dark Canvas) */}
      {/* -------------------------------------------------------------------- */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-8 bg-zinc-950/90 flex justify-center"
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

        {/* Paper Sheet Canvas */}
        <div className="w-full max-w-4xl min-h-[900px] bg-white text-zinc-900 rounded-2xl shadow-2xl p-8 sm:p-14 border border-zinc-200/80 flex flex-col justify-between transition-all">
          <div>
            {/* Editable Document Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                triggerAutoSave(editorRef.current?.innerHTML, e.target.value, citations);
              }}
              placeholder="Document Title (e.g. Synthesis of Retrieval-Augmented Generation)"
              className="w-full text-2xl sm:text-3xl font-bold font-serif text-zinc-900 placeholder-zinc-400 border-none outline-none mb-6 pb-2 border-b border-zinc-200 focus:border-amber-500 transition-colors bg-transparent"
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
              className="prose prose-zinc max-w-none focus:outline-none min-h-[500px] text-[15px] leading-relaxed font-serif text-zinc-800"
              style={{
                outline: 'none',
              }}
            />
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* DYNAMIC BIBLIOGRAPHY & REFERENCES FOOTER                        */}
          {/* ---------------------------------------------------------------- */}
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
                    className="p-3 bg-zinc-50 hover:bg-zinc-100/80 rounded-xl border border-zinc-200/90 transition-colors flex items-start justify-between gap-3 group"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="font-mono font-bold text-amber-600 shrink-0 text-xs mt-0.5">
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
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-zinc-200 transition-colors shrink-0 cursor-pointer opacity-80 group-hover:opacity-100"
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
      {/* BOTTOM METRICS TOOLBAR                                               */}
      {/* -------------------------------------------------------------------- */}
      <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-2 flex items-center justify-between text-xs text-zinc-400 font-mono select-none shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-zinc-500" />
            <span>{wordCount} words</span>
          </span>
          <span className="text-zinc-600">•</span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-zinc-500" />
            <span>~{Math.max(1, Math.ceil(wordCount / 200))} min read</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span>Highlight claim for <b>Cite</b> or <b>Ask AI</b></span>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* SLIDE-OVER DRAWERS                                                   */}
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
