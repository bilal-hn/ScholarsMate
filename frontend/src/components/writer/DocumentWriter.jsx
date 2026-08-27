import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
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
  ChevronLeft,
  ChevronRight,
  ExternalLink
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
  { label: 'Normal text', tag: 'p' },
  { label: 'Heading 1', tag: 'h1' },
  { label: 'Heading 2', tag: 'h2' },
  { label: 'Heading 3', tag: 'h3' },
  { label: 'Subtitle', tag: 'h4' },
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
  const [pageCount, setPageCount] = useState(1);
  const [copied, setCopied] = useState(false);

  // Top Toolbar Collapse State
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);

  // Popover Menus State
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [isSizeMenuOpen, setIsSizeMenuOpen] = useState(false);
  const [isHeadingMenuOpen, setIsHeadingMenuOpen] = useState(false);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [tableGridHover, setTableGridHover] = useState({ rows: 3, cols: 3 });
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Typography State
  const [currentFont, setCurrentFont] = useState("'Source Serif 4', 'Source Serif Pro', Georgia, serif");
  const [currentFontLabel, setCurrentFontLabel] = useState('Source Serif');
  const [currentFontSize, setCurrentFontSize] = useState(12);
  const [currentHeadingLabel, setCurrentHeadingLabel] = useState('Normal text');
  const [activeAlign, setActiveAlign] = useState('justifyLeft');

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

  // Close all popover menus on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      setIsFontMenuOpen(false);
      setIsSizeMenuOpen(false);
      setIsHeadingMenuOpen(false);
      setIsTableMenuOpen(false);
      setIsExportMenuOpen(false);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

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
            let initialHtml = draft.content_html || '';
            // Sanitize and purge any old legacy references blocks that were accidentally persisted into content_html
            initialHtml = initialHtml
              .replace(/<div[^>]*class="[^"]*references[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
              .replace(/<div[^>]*id="reference-[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
              .replace(/<h[1-6][^>]*>References\s*&\s*Bibliography<\/h[1-6]>/gi, '');

            editorRef.current.innerHTML = initialHtml || `
              <p class="section-tag" style="font-family: Inter, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #71717a; text-transform: uppercase; margin-top: 1.5rem; margin-bottom: 0.75rem;">RELATED WORK</p>
              <ul>
                <li><strong>Structure Extraction Complexities:</strong> Preserving complex document elements—such as embedded multi-column tables, mathematical formulas, and structural headers—during vector chunking remains technically non-trivial <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.5</strong></span>.</li>
                <li><strong>Context Scope Dependency:</strong> Retrieval performance is fundamentally bounded by the granularity of chunking algorithms and vector embedding quality <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.5</strong></span> <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.8</strong></span>.</li>
              </ul>
              <h2 style="font-family: 'Source Serif 4', Georgia, serif; font-size: 18px; font-weight: 700; margin-top: 2rem; margin-bottom: 0.75rem; color: #111827;">7. Main Conclusion & Future Directions</h2>
              <p>The proposed ScholarsMate assistant offers a tailored framework for academic research synthesis by integrating structural parsing with modular Retrieval-Augmented Generation <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.5</strong></span> <span class="doc-badge" style="font-family: monospace; font-size: 11px; color: #4b5563; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">📄 AAAAAAAA <strong>p.8</strong></span>. Selecting a claim anywhere in this document surfaces a quiet inline prompt to cite it or ask the assistant — no separate panel required.</p>
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
  // 2. SELECTION DETECTION & WORD COUNT
  // --------------------------------------------------------------------------
  const updateWordCount = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);

    // Calculate dynamic page count (~950px of content per A4 Word page)
    const height = editorRef.current.scrollHeight || 0;
    const pages = Math.max(1, Math.ceil(height / 950));
    setPageCount(pages);
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

  // --------------------------------------------------------------------------
  // 3. BULLETPROOF FORMATTING ACTIONS
  // --------------------------------------------------------------------------
  const formatDoc = (command, value = null) => {
    if (editorRef.current) {
      editorRef.current.focus();
    }

    if (command === 'insertUnorderedList') {
      document.execCommand('insertUnorderedList', false, null);
    } else if (command === 'insertOrderedList') {
      document.execCommand('insertOrderedList', false, null);
    } else if (command === 'h1' || command === 'h2' || command === 'h3' || command === 'h4' || command === 'p') {
      document.execCommand('formatBlock', false, `<${command.toUpperCase()}>`);
    } else if (command === 'quote') {
      document.execCommand('formatBlock', false, '<blockquote>');
    } else if (command === 'insertHorizontalRule') {
      document.execCommand('insertHorizontalRule', false, null);
    } else {
      document.execCommand(command, false, value);
      if (['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
        setActiveAlign(command);
      }
    }

    updateWordCount();
    triggerAutoSave();
  };

  const handleApplyHeading = (styleObj) => {
    setCurrentHeadingLabel(styleObj.label);
    setIsHeadingMenuOpen(false);
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand('formatBlock', false, `<${styleObj.tag.toUpperCase()}>`);
    updateWordCount();
    triggerAutoSave();
  };

  const handleApplyFont = (fontObj) => {
    setCurrentFont(fontObj.value);
    setCurrentFontLabel(fontObj.label);
    setIsFontMenuOpen(false);
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand('fontName', false, fontObj.value);
    triggerAutoSave();
  };

  const handleApplyFontSize = (sizePt) => {
    setCurrentFontSize(sizePt);
    setIsSizeMenuOpen(false);
    if (editorRef.current) {
      editorRef.current.focus();
    }

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
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

  // Microsoft Word / Google Docs-style custom grid table insertion
  const handleInsertCustomTable = (rows, cols) => {
    setIsTableMenuOpen(false);
    if (editorRef.current) {
      editorRef.current.focus();
    }

    let headersHtml = '';
    for (let c = 1; c <= cols; c++) {
      headersHtml += `<th style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-weight: 600; background: #f8fafc; color: #1e293b; word-break: break-word; font-size: 12px;">Header ${c}</th>`;
    }

    let bodyHtml = '';
    for (let r = 1; r <= rows - 1; r++) {
      let rowCells = '';
      for (let c = 1; c <= cols; c++) {
        rowCells += `<td style="border: 1px solid #e2e8f0; padding: 8px 10px; color: #334155; word-break: break-word; font-size: 12px;">Cell ${r},${c}</td>`;
      }
      bodyHtml += `<tr>${rowCells}</tr>`;
    }

    const tableHtml = `
      <table style="width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; margin: 1.5rem 0; font-family: inherit; box-sizing: border-box;">
        <thead>
          <tr style="border-bottom: 2px solid #cbd5e1;">
            ${headersHtml}
          </tr>
        </thead>
        <tbody>
          ${bodyHtml}
        </tbody>
      </table>
      <p><br/></p>
    `;

    document.execCommand('insertHTML', false, tableHtml);
    updateWordCount();
    triggerAutoSave();
  };

  // --------------------------------------------------------------------------
  // 4. SEMANTIC CITATION ENGINE FLOW
  // --------------------------------------------------------------------------
  const handleOpenCitationSearch = async () => {
    const claim = selectedText;
    if (!claim) return;

    // Snapshot exact text range before opening drawer
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedSelectionRange.current = selection.getRangeAt(0).cloneRange();
    }

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
    if (!editorRef.current) return;

    let targetRange = null;
    if (savedSelectionRange.current) {
      targetRange = savedSelectionRange.current.cloneRange();
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        targetRange = sel.getRangeAt(0).cloneRange();
      }
    }

    if (targetRange) {
      targetRange.collapse(false); // Move precisely to the end of the highlighted sentence

      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(targetRange);
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

      // Clean Word-style academic superscript bracket: [1]
      const sup = document.createElement('sup');
      sup.innerHTML = `<span data-citation-id="${nextIndex}" class="citation-ref" style="font-family: inherit; font-size: 0.85em; font-weight: 700; color: #1e3a8a; cursor: pointer; user-select: none; padding: 0 2px;" title="${candidate.doc_name} (Page ${candidate.page_number})">[${nextIndex}]</span>&nbsp;`;

      targetRange.insertNode(sup);

      // Advance cursor immediately after the inserted citation node
      targetRange.setStartAfter(sup);
      targetRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(targetRange);

      setIsCitationDrawerOpen(false);
      updateWordCount();
      triggerAutoSave(editorRef.current.innerHTML, title, updatedCitations);
    }
  };

  const handleInsertPageBreak = () => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
    const pageBreakHtml = `
      <div class="page-break" style="margin: 2.5rem -3.5rem; border-top: 1px dashed #cbd5e1; padding-top: 1rem; text-align: center; color: #94a3b8; font-size: 11px; font-family: monospace; user-select: none;">
        <span>— PAGE BREAK —</span>
      </div>
      <p><br/></p>
    `;
    document.execCommand('insertHTML', false, pageBreakHtml);
    updateWordCount();
    triggerAutoSave();
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
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand('insertText', false, replacementText);
    setIsAskAIDrawerOpen(false);
    updateWordCount();
    triggerAutoSave();
  };

  const handleInsertBelow = (insertionText) => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
    const formattedHtml = `<p>${insertionText}</p>`;
    document.execCommand('insertHTML', false, formattedHtml);
    setIsAskAIDrawerOpen(false);
    updateWordCount();
    triggerAutoSave();
  };

  // --------------------------------------------------------------------------
  // 6. MULTI-FORMAT EXPORT ENGINE (Word .docx, PDF, Markdown, Copy)
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
    setIsExportMenuOpen(false);
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
    setIsExportMenuOpen(false);
  };

  const handleExportDocx = () => {
    if (!editorRef.current) return;
    const htmlContent = editorRef.current.innerHTML;
    let biblioHtml = '';
    if (citations.length > 0) {
      biblioHtml = `<div style="margin-top: 30pt; border-top: 1pt solid #ccc; padding-top: 15pt;"><h2 style="font-size: 14pt; font-weight: bold;">References & Bibliography</h2><ol>${citations.map(c => `<li><strong>${c.doc_name}</strong> (Page ${c.page_number}) — "${c.excerpt}"</li>`).join('')}</ol></div>`;
    }

    const wordHtml = `
      <!DOCTYPE html>
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${title}</title>
        <style>
          body { font-family: 'Times New Roman', 'Source Serif 4', Georgia, serif; font-size: 12pt; line-height: 1.5; color: #111; margin: 1in; }
          h1 { font-size: 24pt; font-weight: bold; margin-bottom: 12pt; }
          h2 { font-size: 16pt; font-weight: bold; margin-top: 16pt; margin-bottom: 6pt; }
          h3 { font-size: 13pt; font-weight: bold; margin-top: 12pt; margin-bottom: 4pt; }
          p { margin-bottom: 8pt; }
          table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
          td, th { border: 1px solid #cbd5e1; padding: 6pt 10pt; text-align: left; }
          th { background-color: #f1f5f9; font-weight: bold; }
          blockquote { border-left: 3pt solid #94a3b8; padding-left: 10pt; margin-left: 0; color: #475569; font-style: italic; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${htmlContent}
        ${biblioHtml}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'document'}.docx`;
    link.click();
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  const handleExportPdf = () => {
    if (!editorRef.current) return;
    setIsExportMenuOpen(false);

    import('html2pdf.js').then((html2pdfModule) => {
      const html2pdf = html2pdfModule.default || html2pdfModule;
      const element = document.createElement('div');
      element.style.padding = '40px';
      element.style.fontFamily = currentFont;
      element.style.color = '#111827';
      element.style.backgroundColor = '#ffffff';
      element.innerHTML = `<h1 style="font-size: 26px; font-weight: bold; margin-bottom: 20px; font-family: serif;">${title}</h1>${editorRef.current.innerHTML}`;
      
      if (citations.length > 0) {
        element.innerHTML += `<div style="margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 20px;"><h2 style="font-size: 16px; font-weight: bold;">References & Bibliography</h2><ol>${citations.map(c => `<li><strong>${c.doc_name}</strong> (Page ${c.page_number}) — "${c.excerpt}"</li>`).join('')}</ol></div>`;
      }
      
      const opt = {
        margin: 15,
        filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'document'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      html2pdf().set(opt).from(element).save();
    }).catch(() => {
      window.print();
    });
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#121316] text-zinc-100 font-sans select-text relative overflow-hidden">
      {/* -------------------------------------------------------------------- */}
      {/* 1. COLLAPSIBLE TOP RIBBON TOOLBAR (Overflow visible so popovers float) */}
      {/* -------------------------------------------------------------------- */}
      <div
        className={`relative z-30 transition-all duration-300 ease-in-out shrink-0 ${
          isToolbarCollapsed ? 'h-0 opacity-0 overflow-hidden pointer-events-none' : 'h-auto opacity-100 overflow-visible'
        }`}
      >
        <div className="bg-[#18191c] border-b border-[#282a2e] px-3.5 py-2 flex items-center justify-between gap-2 select-none shadow-xl text-zinc-300 text-xs overflow-visible">
          {/* Left Controls Cluster */}
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap shrink-0 overflow-visible">
            {/* Close Writer Button (Cross / X) */}
            {onClose && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClose}
                className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer shrink-0 mr-1"
                title="Close Document Writer"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Undo / Redo */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('undo')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('redo')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* Custom Font Family Popover */}
            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsFontMenuOpen(!isFontMenuOpen);
                  setIsSizeMenuOpen(false);
                  setIsHeadingMenuOpen(false);
                  setIsTableMenuOpen(false);
                  setIsExportMenuOpen(false);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#282a2e] text-zinc-200 text-xs font-medium border border-transparent hover:border-zinc-700 transition-colors cursor-pointer"
                title="Font Family"
              >
                <span>{currentFontLabel}</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              {isFontMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 p-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 w-44 max-h-64 overflow-y-auto space-y-0.5">
                  {FONT_FAMILIES.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleApplyFont(f)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-amber-300 transition-colors cursor-pointer"
                      style={{ fontFamily: f.value }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Font Size Popover */}
            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsSizeMenuOpen(!isSizeMenuOpen);
                  setIsFontMenuOpen(false);
                  setIsHeadingMenuOpen(false);
                  setIsTableMenuOpen(false);
                  setIsExportMenuOpen(false);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#282a2e] text-zinc-200 text-xs font-medium border border-transparent hover:border-zinc-700 transition-colors cursor-pointer"
                title="Font Size"
              >
                <span>{currentFontSize}</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              {isSizeMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 p-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 w-24 max-h-56 overflow-y-auto space-y-0.5">
                  {FONT_SIZES.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleApplyFontSize(s.pt)}
                      className="w-full text-center px-2 py-1 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-amber-300 transition-colors cursor-pointer"
                    >
                      {s.label} pt
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Heading / Style Popover */}
            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsHeadingMenuOpen(!isHeadingMenuOpen);
                  setIsFontMenuOpen(false);
                  setIsSizeMenuOpen(false);
                  setIsTableMenuOpen(false);
                  setIsExportMenuOpen(false);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#282a2e] text-zinc-200 text-xs font-medium border border-transparent hover:border-zinc-700 transition-colors cursor-pointer"
                title="Styles"
              >
                <span>{currentHeadingLabel}</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              {isHeadingMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 p-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 w-36 space-y-0.5">
                  {HEADING_STYLES.map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleApplyHeading(h)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-amber-300 transition-colors cursor-pointer font-medium"
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* B, I, U, S */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('bold')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 font-bold transition-colors cursor-pointer shrink-0"
              title="Bold (Ctrl+B)"
            >
              <span className="font-bold text-xs">B</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('italic')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 italic transition-colors cursor-pointer shrink-0"
              title="Italic (Ctrl+I)"
            >
              <span className="italic font-serif text-xs">I</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('underline')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 underline transition-colors cursor-pointer shrink-0"
              title="Underline (Ctrl+U)"
            >
              <span className="underline text-xs">U</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('strikeThrough')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-300 hover:text-zinc-100 line-through transition-colors cursor-pointer shrink-0"
              title="Strikethrough"
            >
              <span className="line-through text-xs">S</span>
            </button>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* Alignments (Left active by default in teal block style) */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
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
              onMouseDown={(e) => e.preventDefault()}
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
              onMouseDown={(e) => e.preventDefault()}
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
              onMouseDown={(e) => e.preventDefault()}
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

            {/* Lists & Academic Elements */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('insertUnorderedList')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Bullet Points List"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('insertOrderedList')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Numbered List"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('quote')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Blockquote (Literature citation)"
            >
              <Quote className="h-3.5 w-3.5" />
            </button>

            {/* Word-style Interactive Table Grid Selector */}
            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsTableMenuOpen(!isTableMenuOpen);
                  setIsFontMenuOpen(false);
                  setIsSizeMenuOpen(false);
                  setIsHeadingMenuOpen(false);
                  setIsExportMenuOpen(false);
                }}
                className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer shrink-0"
                title="Insert Table (Grid Selector)"
              >
                <TableIcon className="h-3.5 w-3.5" />
              </button>

              {isTableMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 p-3 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 w-52 select-none">
                  <div className="text-[11px] font-semibold text-zinc-300 mb-2 flex items-center justify-between">
                    <span>Insert Table</span>
                    <span className="font-mono text-amber-400 text-[10px]">
                      {tableGridHover.rows} × {tableGridHover.cols}
                    </span>
                  </div>

                  {/* 6x6 Grid of cells */}
                  <div className="grid grid-cols-6 gap-1 bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                    {[1, 2, 3, 4, 5, 6].map((r) =>
                      [1, 2, 3, 4, 5, 6].map((c) => {
                        const isHovered = r <= tableGridHover.rows && c <= tableGridHover.cols;
                        return (
                          <div
                            key={`${r}-${c}`}
                            onMouseEnter={() => setTableGridHover({ rows: r, cols: c })}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleInsertCustomTable(r, c)}
                            className={`w-5 h-5 rounded-xs border cursor-pointer transition-all ${
                              isHovered
                                ? 'bg-amber-400/80 border-amber-300 shadow-xs'
                                : 'bg-zinc-900 border-zinc-700/60 hover:border-zinc-500'
                            }`}
                          />
                        );
                      })
                    )}
                  </div>

                  <div className="mt-2 text-center text-[10px] text-zinc-400">
                    Click to insert {tableGridHover.rows} × {tableGridHover.cols} Table
                  </div>
                </div>
              )}
            </div>

            {/* Section Divider Rule */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('insertHorizontalRule')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Divider / Section Rule"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            {/* Insert Page Break */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleInsertPageBreak}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Insert Page Break"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>

            <div className="h-4 w-px bg-zinc-700/60 mx-1 shrink-0" />

            {/* Clear Formatting */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => formatDoc('removeFormat')}
              className="p-1.5 rounded hover:bg-[#282a2e] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Clear Formatting"
            >
              <RemoveFormatting className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Right Status & Actions Cluster */}
          <div className="flex items-center gap-2.5 flex-nowrap shrink-0 ml-auto pl-2">
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
              className="flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded hover:bg-[#282a2e] transition-colors cursor-pointer font-medium shrink-0"
              title="Copy as Markdown"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-zinc-400" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Export Multi-Format Dropdown */}
            <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsExportMenuOpen(!isExportMenuOpen);
                  setIsFontMenuOpen(false);
                  setIsSizeMenuOpen(false);
                  setIsHeadingMenuOpen(false);
                  setIsTableMenuOpen(false);
                }}
                className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 px-2.5 py-1 rounded hover:bg-[#282a2e] transition-colors cursor-pointer font-medium shrink-0 bg-zinc-900 border border-zinc-700/60"
                title="Export Document"
              >
                <Download className="h-3.5 w-3.5 text-amber-400" />
                <span>Export</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute top-full right-0 mt-1.5 p-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 w-52 space-y-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleExportDocx}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-blue-400 transition-colors cursor-pointer text-left"
                  >
                    <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Microsoft Word (.docx)</div>
                      <div className="text-[10px] text-zinc-400">Formatted Word document</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleExportPdf}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-red-400 transition-colors cursor-pointer text-left"
                  >
                    <Download className="h-4 w-4 text-red-400 shrink-0" />
                    <div>
                      <div className="font-semibold">PDF Document (.pdf)</div>
                      <div className="text-[10px] text-zinc-400">Printable publication layout</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleDownloadMarkdown}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-200 hover:bg-zinc-800 hover:text-amber-400 transition-colors cursor-pointer text-left"
                  >
                    <FileCode className="h-4 w-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Markdown (.md)</div>
                      <div className="text-[10px] text-zinc-400">Clean text synthesis</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

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

      {/* Center Toolbar Collapse Tab */}
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
      {/* 2. FULLSCREEN RESTORE ARROW (Only shown in Fullscreen mode)           */}
      {/* -------------------------------------------------------------------- */}
      {isFullscreen && onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="fixed top-1/2 left-3 -translate-y-1/2 z-50 p-2 bg-[#1e2024]/90 hover:bg-[#282a2e] border border-zinc-700/60 rounded-full shadow-2xl text-zinc-400 hover:text-zinc-100 transition-all cursor-pointer group"
          title="Restore Split View (Collapse)"
        >
          <ChevronRight className="h-4 w-4 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 3. SCROLLABLE DOCUMENT CANVAS CONTAINER (Light Paper Sheet)          */}
      {/* -------------------------------------------------------------------- */}
      <div
        className={`flex-1 overflow-y-auto bg-[#121316] flex justify-center items-start pb-36 transition-all duration-300 ${
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

        {/* Word-Style Paginated Canvas (A4 Sheet Dimensions) */}
        <div className="word-canvas-wrapper my-6 pb-28">
          <div
            style={{
              fontFamily: currentFont,
              fontSize: `${currentFontSize}pt`,
            }}
            className="word-document-canvas"
          >
            {/* 1. Document Title Header */}
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                triggerAutoSave(editorRef.current?.innerHTML, e.target.value, citations);
              }}
              placeholder="Document Title"
              className="w-full text-3xl sm:text-4xl font-bold text-zinc-900 placeholder-zinc-400 border-none outline-none mb-6 pb-2 transition-colors bg-transparent font-serif"
            />

            {/* 2. Rich Contenteditable Manuscript Body */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                updateWordCount();
                triggerAutoSave(editorRef.current?.innerHTML, title, citations);
              }}
              className="academic-editor prose prose-zinc max-w-none focus:outline-none min-h-[600px] leading-relaxed text-[#1a1a1a]"
            />

            {/* 3. References & Bibliography Section (Pinned at the bottom of the manuscript) */}
            {citations && citations.length > 0 && (
              <div
                contentEditable={false}
                suppressContentEditableWarning
                className="mt-20 pt-10 border-t-2 border-zinc-200 font-sans text-xs text-zinc-700 select-text not-prose pointer-events-auto"
              >
                <div className="flex items-center justify-between mb-8 border-b-2 border-zinc-200 pb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-zinc-900 font-serif tracking-tight">
                      References & Bibliography
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Grounded workspace citations and verified source passages
                    </p>
                  </div>
                  <span className="text-xs font-mono text-zinc-600 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded">
                    {citations.length} Sources Cited
                  </span>
                </div>

                <div className="space-y-4">
                  {citations.map((cite) => (
                    <div
                      key={cite.id}
                      id={`reference-${cite.id}`}
                      className="p-4 bg-zinc-50/90 hover:bg-zinc-100/90 rounded-lg border border-zinc-200 transition-colors flex items-start justify-between gap-4 group shadow-xs"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="font-bold text-zinc-900 font-serif shrink-0 text-base">
                          [{cite.id}]
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-zinc-900 text-sm">
                              {cite.doc_name}
                            </span>
                            <span className="text-xs text-zinc-500 font-mono bg-zinc-200/70 px-1.5 py-0.5 rounded">
                              Page {cite.page_number}
                            </span>
                            {cite.similarity_score && (
                              <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                {Math.round(cite.similarity_score * 100)}% match
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-700 italic mt-2 leading-relaxed bg-white/80 p-2.5 rounded border border-zinc-200/60 font-serif">
                            "{cite.excerpt}"
                          </p>
                        </div>
                      </div>

                      {onOpenPdfViewer && (
                        <button
                          type="button"
                          onClick={() => onOpenPdfViewer(cite.doc_name, cite.page_number)}
                          className="p-2 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors shrink-0 cursor-pointer"
                          title={`Open ${cite.doc_name} at Page ${cite.page_number}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Bottom Document Page Footer */}
            <div
              contentEditable={false}
              suppressContentEditableWarning
              className="mt-16 pt-4 border-t border-zinc-200 flex items-center justify-between text-[11px] text-zinc-400 font-mono select-none"
            >
              <span>{title || 'Academic Draft'}</span>
              <span>{pageCount > 1 ? `Page 1 of ${pageCount}` : 'Page 1 of 1'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 4. BOTTOM METRICS FOOTER (Matches Screenshot)                        */}
      {/* -------------------------------------------------------------------- */}
      <div className="bg-[#121316] border-t border-[#24262b] px-6 py-2.5 flex items-center justify-between text-xs text-zinc-400 select-none shrink-0 fixed bottom-0 left-0 right-0 z-20">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-zinc-500" />
          <span>{wordCount} words · ~{Math.max(1, Math.ceil(wordCount / 200))} min read · Page {pageCount > 1 ? `1 of ${pageCount}` : '1 of 1'}</span>
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
