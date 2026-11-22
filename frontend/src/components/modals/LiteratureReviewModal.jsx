import React, { useState, useMemo, useRef } from 'react';
import {
  BookOpen,
  X,
  Sparkles,
  CheckSquare,
  Square,
  Download,
  Loader2,
  FileCheck2,
  GripVertical,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import html2pdf from 'html2pdf.js';

const DEFAULT_HEADINGS = [
  'Introduction & Background',
  'Methodological Comparison',
  'Key Findings & Analysis',
  'Critical Gaps & Limitations',
  'Conclusion & Future Directions',
];

export default function LiteratureReviewModal({
  isOpen,
  onClose,
  documents = [],
  selectedDocs = [],
  currentModel,
  customKeys,
  onGenerateReview,
}) {
  const printDocumentRef = useRef(null);

  const normalizedDocList = useMemo(() => {
    return (documents || []).map((d) => (typeof d === 'string' ? d : d?.doc_name || '')).filter(Boolean);
  }, [documents]);

  const normalizedSelected = useMemo(() => {
    return (selectedDocs || []).map((d) => (typeof d === 'string' ? d : d?.doc_name || '')).filter(Boolean);
  }, [selectedDocs]);

  const [activePapers, setActivePapers] = useState(() =>
    normalizedSelected.length > 0 ? normalizedSelected : normalizedDocList
  );
  const [researchFocus, setResearchFocus] = useState('');
  const [customHeadings, setCustomHeadings] = useState([...DEFAULT_HEADINGS]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentStage, setCurrentStage] = useState('');
  const [monograph, setMonograph] = useState(null);

  // ── LaTeX Numbered Citation Formatter ─────────────────────────────────────────
  const formatCitations = (content, docList = []) => {
    if (!content || typeof content !== 'string') return content;
    const docMap = {};
    (docList || []).forEach((doc, idx) => {
      const num = String(idx + 1);
      docMap[doc.toLowerCase()] = num;
      docMap[doc.replace(/\.pdf$/i, '').toLowerCase()] = num;
      docMap[doc.replace(/_/g, ' ').toLowerCase()] = num;
      docMap[doc.replace(/[-_.]/g, ' ').toLowerCase()] = num;
    });

    const findDocNum = (str) => {
      const clean = str.replace(/,\s*p(?:p)?\.?\s*[\d\-–]+.*/i, '').trim().toLowerCase();
      for (const [key, num] of Object.entries(docMap)) {
        if (clean === key || clean.includes(key) || key.includes(clean)) {
          return num;
        }
      }
      return null;
    };

    // 1. Bracket citations: [doc.pdf, p. 4] or [doc1.pdf, doc2.pdf]
    let result = content.replace(/\[([^\]]+)\]/g, (match, inner) => {
      const trimmed = inner.trim();
      if (/^\d+(?:,\s*p(?:p)?\.?\s*[\d\-–]+)?$/i.test(trimmed)) return match;
      if (/^\d+(?:\s*,\s*\d+)*$/.test(trimmed) || /^\d+\s*[\-–]\s*\d+$/.test(trimmed)) return match;

      const singlePageMatch = trimmed.match(/,\s*(p(?:p)?\.?\s*[\d\-–]+)/i);
      const docPart = trimmed.replace(/,\s*p(?:p)?\.?\s*[\d\-–]+.*/i, '').trim();
      const singleNum = findDocNum(docPart);
      if (singleNum && !trimmed.includes(';') && !/\.pdf.*\.pdf/i.test(trimmed)) {
        const pageSuffix = singlePageMatch ? `, ${singlePageMatch[1]}` : '';
        return `[${singleNum}${pageSuffix}]`;
      }

      const items = trimmed.split(/;\s*|,\s*(?=[^,]*\.(?:pdf|docx|txt)|\b[A-Za-z0-9_\-]{4,}\b)/i);
      const resolvedNums = [];
      let commonPage = '';

      items.forEach((item) => {
        const pMatch = item.match(/,\s*(p(?:p)?\.?\s*[\d\-–]+)/i);
        if (pMatch && !commonPage) commonPage = `, ${pMatch[1]}`;
        const num = findDocNum(item);
        if (num && !resolvedNums.includes(num)) {
          resolvedNums.push(num);
        }
      });

      if (resolvedNums.length > 0) {
        return `[${resolvedNums.sort((a, b) => Number(a) - Number(b)).join(', ')}${commonPage}]`;
      }
      return match;
    });

    // 2. Parenthetical citations: (doc.pdf, p. 4) -> [1, p. 4]
    result = result.replace(/\(([^)]+\.pdf(?:,\s*p(?:p)?\.?\s*[\d\-–]+)?)\)/gi, (match, inner) => {
      const pageMatch = inner.match(/,\s*(p(?:p)?\.?\s*[\d\-–]+)/i);
      const pageSuffix = pageMatch ? `, ${pageMatch[1]}` : '';
      const num = findDocNum(inner);
      if (num) {
        return `[${num}${pageSuffix}]`;
      }
      return match;
    });

    return result;
  };

  // ── Table preprocessor (Academic LaTeX Booktabs Style) ───────────────────────
  const preprocessTables = (content) => {
    if (!content || !content.includes('|')) return content;

    const lines = content.split('\n');
    let inTable = false;
    let htmlOutput = [];
    let tableRows = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (/^\|[\s\-:]+([\|\s\-:]+)*\|$/.test(trimmed)) {
          return;
        }
        inTable = true;
        const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
        tableRows.push(cells);
      } else {
        if (inTable) {
          htmlOutput.push(renderHtmlTable(tableRows));
          tableRows = [];
          inTable = false;
        }
        htmlOutput.push(line);
      }
    });

    if (inTable && tableRows.length > 0) {
      htmlOutput.push(renderHtmlTable(tableRows));
    }

    return htmlOutput.join('\n');
  };

  const renderHtmlTable = (rows) => {
    if (rows.length === 0) return '';
    const header = rows[0];
    const body = rows.slice(1);

    const captionHtml = `<div class="latex-table-caption" style="text-align: center; font-size: 8.5pt; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif; margin-bottom: 6px; color: #000000;"><span style="font-weight: 700;">Table 1:</span> <span style="font-style: italic;">Comparative Analysis of Methodologies, Architectural Paradigms, and Empirical Findings</span></div>`;

    const headerHtml = `<thead><tr>${header
      .map(
        (h) =>
          `<th style="background-color: transparent; color: #000000; padding: 7px 9px; border-bottom: 1pt solid #000000; font-weight: 700; font-size: 8pt; text-align: left; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif;">${h}</th>`
      )
      .join('')}</tr></thead>`;

    const bodyHtml = `<tbody>${body
      .map(
        (row) =>
          `<tr style="page-break-inside: avoid !important; break-inside: avoid !important;">${row
            .map(
              (c) =>
                `<td style="padding: 6px 9px; border-bottom: 0.25pt solid #e5e5e5; color: #000000; font-size: 7.5pt; vertical-align: top; line-height: 1.45; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif;">${c}</td>`
            )
            .join('')}</tr>`
      )
      .join('')}</tbody>`;

    const noteHtml = `<div class="latex-table-note" style="font-size: 7pt; font-style: italic; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif; color: #222222; margin-top: 5px; text-align: left;">Note: Citations in bracket notation correspond to verified primary indexed literature in the reference catalog.</div>`;

    return `<div class="pdf-table-wrap" style="overflow-x: auto; margin: 18px 0; page-break-inside: auto !important; break-inside: auto !important;">${captionHtml}<table style="width: 100%; border-collapse: collapse; border-top: 1.5pt solid #000000; border-bottom: 1.5pt solid #000000; font-family: 'Latin Modern Roman', 'Computer Modern', 'Times New Roman', serif;">${headerHtml}${bodyHtml}</table>${noteHtml}</div>`;
  };

  // ── PDF export ───────────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (!printDocumentRef.current || isExporting) return;
    setIsExporting(true);

    const filename = `${(monograph?.title || 'Literature_Review').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    const element = printDocumentRef.current;
    const clonedElement = element.cloneNode(true);

    clonedElement.style.width = '700px';
    clonedElement.style.margin = '0 auto';
    clonedElement.style.padding = '0';
    clonedElement.style.backgroundColor = '#ffffff';
    clonedElement.style.color = '#000000';
    clonedElement.style.fontFamily = '"Latin Modern Roman", "Computer Modern", "Times New Roman", Times, "Nimbus Roman No9 L", serif';
    clonedElement.style.boxSizing = 'border-box';

    const printStyles = document.createElement('style');
    printStyles.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Latin+Modern+Roman:ital,wght@0,400;0,700;1,400;1,700&display=swap');

      * {
        box-sizing: border-box !important;
      }
      body, div, p, span, h1, h2, h3, h4, th, td, li, table, strong, em {
        font-family: "Latin Modern Roman", "Computer Modern", "Times New Roman", Times, "Nimbus Roman No9 L", serif !important;
        color: #000000 !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .pdf-section {
        page-break-inside: auto !important;
        break-inside: auto !important;
        margin-bottom: 20px !important;
      }
      h1, h2, h3, h4 {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        color: #000000 !important;
      }
      h1 {
        font-size: 18pt !important;
        font-weight: 700 !important;
        color: #000000 !important;
        margin-bottom: 8px !important;
        line-height: 1.25 !important;
        text-align: center !important;
      }
      h2 {
        font-size: 12.5pt !important;
        font-weight: 700 !important;
        color: #000000 !important;
        margin-top: 22px !important;
        margin-bottom: 8px !important;
        border: none !important;
      }
      h3 {
        font-size: 10.5pt !important;
        font-weight: 700 !important;
        color: #000000 !important;
        margin-top: 14px !important;
        margin-bottom: 6px !important;
      }
      h4 {
        font-size: 9.5pt !important;
        font-weight: 700 !important;
        font-style: italic !important;
        color: #000000 !important;
        margin-top: 10px !important;
        margin-bottom: 4px !important;
      }
      p {
        font-size: 9.5pt !important;
        line-height: 1.6 !important;
        color: #000000 !important;
        margin-bottom: 10px !important;
        text-align: justify !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      li {
        font-size: 9pt !important;
        line-height: 1.5 !important;
        color: #000000 !important;
        margin-bottom: 4px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      blockquote {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        border-left: 1.5pt solid #000000 !important;
        background-color: transparent !important;
        padding: 4px 12px !important;
        margin: 10px 0 !important;
        font-style: italic !important;
        font-size: 9pt !important;
        color: #000000 !important;
      }
      table {
        page-break-inside: auto !important;
        break-inside: auto !important;
        width: 100% !important;
        border-collapse: collapse !important;
        border-top: 1.5pt solid #000000 !important;
        border-bottom: 1.5pt solid #000000 !important;
        margin: 14px 0 !important;
      }
      th {
        border-bottom: 0.75pt solid #000000 !important;
        background-color: transparent !important;
        color: #000000 !important;
        font-weight: 700 !important;
        padding: 6px 8px !important;
        font-size: 8pt !important;
        text-align: left !important;
      }
      td {
        border-bottom: 0.25pt solid #e5e5e5 !important;
        color: #000000 !important;
        padding: 5px 8px !important;
        font-size: 7.5pt !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      th, td {
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .avoid-break {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .latex-toc-entry {
        display: flex !important;
        align-items: baseline !important;
        justify-content: space-between !important;
        width: 100% !important;
        margin-bottom: 4px !important;
        font-size: 9pt !important;
      }
      .latex-toc-dots {
        flex: 1 1 auto !important;
        border-bottom: 1.5px dotted #000000 !important;
        margin: 0 8px 3px 8px !important;
        min-width: 20px !important;
      }
      .latex-bib-entry {
        display: flex !important;
        align-items: flex-start !important;
        gap: 8px !important;
        margin-bottom: 6px !important;
        font-size: 8.5pt !important;
        line-height: 1.4 !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      hr {
        border: none !important;
        border-top: 0.5pt solid #000000 !important;
        margin: 18px 0 !important;
      }
    `;
    clonedElement.prepend(printStyles);

    const opt = {
      margin: [12, 12, 12, 12],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: 0,
        scrollX: 0,
        windowWidth: 700,
        ignoreElements: (node) => node.tagName === 'BUTTON',
        onclone: (clonedDoc) => {
          const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
          styles.forEach((s) => {
            if (s.innerHTML && s.innerHTML.includes('oklch')) {
              s.remove();
            }
          });
        },
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['h1', 'h2', 'h3', 'tr', 'blockquote', '.avoid-break', 'li', '.latex-bib-entry'],
      },
    };

    try {
      await html2pdf().set(opt).from(clonedElement).save();
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF: ' + (err.message || 'Rendering error'));
    } finally {
      setIsExporting(false);
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  const togglePaper = (docName) => {
    setActivePapers((prev) =>
      prev.includes(docName) ? prev.filter((d) => d !== docName) : [...prev, docName]
    );
  };

  const handleStartSynthesis = async () => {
    if (activePapers.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setCurrentStage('Constructing thematic taxonomy and section-level queries...');

    try {
      const payload = {
        doc_names: activePapers,
        research_focus: researchFocus.trim(),
        depth: 'detailed',
        model_name: currentModel,
        custom_keys: customKeys,
        custom_headings: customHeadings,
      };

      const data = await onGenerateReview(payload);
      setMonograph(data);
    } catch (err) {
      alert(`Synthesis Failed: ${err.message || 'Error generating review.'}`);
    } finally {
      setIsGenerating(false);
      setCurrentStage('');
    }
  };

  const synthesizedDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-zinc-100">Literature Review</span>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── LEFT PANEL ── */}
          <div className="w-72 shrink-0 border-r border-zinc-800 overflow-y-auto flex flex-col">
            <div className="space-y-5 p-4 flex-1">

              {/* A. Papers */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold text-zinc-300">Papers</span>
                  <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-1.5 py-0.5 leading-none">
                    {activePapers.length} selected
                  </span>
                </div>
                <div className="space-y-1">
                  {normalizedDocList.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">No papers in workspace.</p>
                  ) : (
                    normalizedDocList.map((docName, idx) => {
                      const selected = activePapers.includes(docName);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => togglePaper(docName)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                            selected
                              ? 'bg-amber-500/15 border border-amber-500/40 text-zinc-100 font-medium'
                              : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {selected
                            ? <CheckSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            : <Square className="h-3.5 w-3.5 text-zinc-500 shrink-0" />}
                          <span className="truncate">{docName}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* B. Research Focus */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-2">
                  Focus <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={researchFocus}
                  onChange={(e) => setResearchFocus(e.target.value)}
                  placeholder="e.g. Compare retrieval strategies and accuracy trade-offs."
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50 resize-none"
                />
              </div>

              {/* C. Section Headings */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold text-zinc-300">Headings</span>
                  <span className="text-[10px] text-zinc-500">(editable)</span>
                </div>
                <div className="space-y-1.5">
                  {customHeadings.map((heading, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <GripVertical className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                      <span className="text-[10px] text-zinc-600 w-3.5 shrink-0">{idx + 1}.</span>
                      <input
                        type="text"
                        value={heading}
                        onChange={(e) => {
                          const updated = [...customHeadings];
                          updated[idx] = e.target.value;
                          setCustomHeadings(updated);
                        }}
                        className="flex-1 text-xs bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-400/40"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">These become the main sections of your review.</p>
              </div>

            </div>

            {/* Generate button */}
            <div className="p-4 shrink-0">
              <button
                type="button"
                onClick={handleStartSynthesis}
                disabled={isGenerating || activePapers.length === 0}
                className={`w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                  isGenerating || activePapers.length === 0
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 cursor-pointer'
                }`}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Generating…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Generate Review</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900/30">

            {/* Minimal top bar when monograph is ready */}
            {monograph && (
              <div className="px-5 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80 shrink-0">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-zinc-300 font-medium">
                    Review ready · {monograph.doc_names?.length || activePapers.length} papers
                  </span>
                </div>
                <button
                  onClick={handleDownloadPDF}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  <span>{isExporting ? 'Exporting…' : 'Download PDF'}</span>
                </button>
              </div>
            )}

            {/* Content area */}
            <div className="flex-1 overflow-y-auto p-8 flex justify-center">
              {isGenerating ? (
                /* Generating state */
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                  <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse">
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">Synthesizing Literature Review</h3>
                    <p className="text-xs text-zinc-400 font-mono mt-2">{currentStage}</p>
                  </div>
                  <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-amber-400 h-full w-2/3 animate-pulse rounded-full" />
                  </div>
                </div>
              ) : monograph ? (
                /* Rendered document */
                <div
                  ref={printDocumentRef}
                  className="w-full max-w-3xl bg-white text-black p-12 md:p-16 shadow-2xl rounded-sm leading-relaxed"
                  style={{
                    minHeight: '1100px',
                    fontFamily: '"Latin Modern Roman", "Computer Modern", "Times New Roman", Times, "Nimbus Roman No9 L", serif',
                    color: '#000000',
                  }}
                >
                  {/* Formal LaTeX Paper Header (\maketitle) */}
                  <div className="pdf-section pb-6 mb-6 text-center">
                    <span className="text-[9pt] tracking-[0.2em] uppercase font-bold text-black block mb-3">
                      ScholarsMate Academic Monograph Series
                    </span>
                    <h1 className="text-2xl md:text-3xl font-bold text-black leading-tight mb-3 tracking-normal">
                      {monograph.title}
                    </h1>
                    <div className="text-xs text-black flex items-center justify-center gap-3 mt-2">
                      <span>Corpus Synthesis across {monograph.doc_names?.length} Primary Research Works</span>
                      <span>•</span>
                      <span>{synthesizedDate}</span>
                    </div>
                    <div className="text-[10px] text-zinc-700 italic mt-1">
                      ScholarsMate Automated Systematic Synthesis Engine
                    </div>
                    <div className="w-16 h-[0.75px] bg-black mx-auto mt-4"></div>
                  </div>

                  {/* LaTeX Abstract Block (\begin{abstract}) */}
                  <div className="pdf-section my-6 px-8 md:px-12 text-justify avoid-break">
                    <div className="text-center font-bold tracking-[0.2em] text-[9.5pt] uppercase mb-2.5 text-black">
                      Abstract
                    </div>
                    <p className="text-[9.5pt] italic text-black leading-relaxed mb-3">
                      This monograph presents an integrative, systematic synthesis of conceptual frameworks, architectural paradigms, empirical benchmarks, and unresolved limitations across {monograph.doc_names?.length || activePapers.length} primary research works indexed in the ScholarsMate workspace. By reconciling conflicting methodological taxonomies and synthesizing empirical evidence across comparative axes, this work formalizes the core tradeoffs and outlines foundational trajectories for ongoing inquiry.
                    </p>
                    {monograph.research_focus && (
                      <div className="text-[9pt] text-black pt-1">
                        <span className="font-bold not-italic">Keywords &amp; Focus Directive: </span>
                        <span className="italic">{monograph.research_focus}</span>
                      </div>
                    )}
                    <div className="text-[9pt] text-black pt-0.5">
                      <span className="font-bold not-italic">Primary Indexed Corpus: </span>
                      <span className="italic">{monograph.doc_names?.join(', ')}</span>
                    </div>
                  </div>

                  <hr className="my-6 border-black/40" />

                  {/* LaTeX Table of Contents (Contents) */}
                  <div className="pdf-section my-8 avoid-break">
                    <div className="text-[12pt] font-bold text-black uppercase tracking-wider mb-4 border-b border-black pb-1">
                      Contents
                    </div>
                    <div className="space-y-1.5 text-[9.5pt] text-black">
                      {monograph.sections?.map((sec, i) => (
                        <div key={i} className="latex-toc-entry flex items-baseline justify-between py-0.5">
                          <span className="font-bold mr-2 w-5 shrink-0">{sec.section_number || i + 1}</span>
                          <span className="shrink-0">{customHeadings[i] || sec.title}</span>
                          <span className="latex-toc-dots flex-1 mx-2 border-b border-dotted border-black h-0 self-center"></span>
                          <span className="shrink-0 tabular-nums">{i + 1}</span>
                        </div>
                      ))}
                      {monograph.matrix_table && (
                        <div className="latex-toc-entry flex items-baseline justify-between py-0.5 pl-6">
                          <span className="italic shrink-0">Table 1: Systematic Comparative Matrix</span>
                          <span className="latex-toc-dots flex-1 mx-2 border-b border-dotted border-black h-0 self-center"></span>
                          <span className="shrink-0 tabular-nums">3</span>
                        </div>
                      )}
                      {monograph.conclusion && (
                        <div className="latex-toc-entry flex items-baseline justify-between py-0.5">
                          <span className="font-bold mr-2 w-5 shrink-0">{(monograph.sections?.length || 5) + 1}</span>
                          <span className="shrink-0">Integrative Conclusion &amp; Strategic Roadmap</span>
                          <span className="latex-toc-dots flex-1 mx-2 border-b border-dotted border-black h-0 self-center"></span>
                          <span className="shrink-0 tabular-nums">{(monograph.sections?.length || 5) + 1}</span>
                        </div>
                      )}
                      <div className="latex-toc-entry flex items-baseline justify-between py-0.5">
                        <span className="font-bold mr-2 w-5 shrink-0"></span>
                        <span className="font-bold shrink-0">References &amp; Primary Document Catalog</span>
                        <span className="latex-toc-dots flex-1 mx-2 border-b border-dotted border-black h-0 self-center"></span>
                        <span className="shrink-0 tabular-nums">{(monograph.sections?.length || 5) + 2}</span>
                      </div>
                    </div>
                  </div>

                  <hr className="my-8 border-black/40" />

                  {/* Core sections */}
                  {monograph.sections?.map((sec, idx) => (
                    <div key={idx} className="pdf-section my-8">
                      {/* LaTeX Section Header */}
                      <h2 className="text-[13pt] font-bold text-black tracking-tight mt-8 mb-3 flex items-baseline gap-2.5">
                        <span>{sec.section_number}.</span>
                        <span>{customHeadings[idx] || sec.title}</span>
                      </h2>
                      <div className="text-justify leading-relaxed text-black space-y-3">
                        <ReactMarkdown
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            h3: ({ children }) => (
                              <h3 className="text-[11pt] font-bold text-black mt-5 mb-2">
                                {children}
                              </h3>
                            ),
                            h4: ({ children }) => (
                              <h4 className="text-[10pt] font-bold italic text-black mt-4 mb-1">
                                {children}
                              </h4>
                            ),
                            p: ({ children }) => (
                              <p className="mb-3.5 text-justify leading-relaxed text-[10pt] text-black">
                                {children}
                              </p>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-2 border-black pl-4 italic text-black my-3 text-[9.5pt]">
                                {children}
                              </blockquote>
                            ),
                            hr: () => <hr className="my-6 border-black/30" />,
                          }}
                        >
                          {formatCitations(preprocessTables(sec.content), monograph.doc_names)}
                        </ReactMarkdown>
                      </div>

                      {/* Methodological matrix after section 2 */}
                      {idx === 1 && monograph.matrix_table && (
                        <div className="pdf-section my-8 avoid-break">
                          <div dangerouslySetInnerHTML={{ __html: preprocessTables(formatCitations(monograph.matrix_table, monograph.doc_names)) }} />
                        </div>
                      )}
                    </div>
                  ))}

                  <hr className="my-8 border-black/40" />

                  {/* Conclusion (Section 6) */}
                  {monograph.conclusion && (
                    <div className="pdf-section my-8">
                      <h2 className="text-[13pt] font-bold text-black tracking-tight mt-8 mb-3 flex items-baseline gap-2.5">
                        <span>{(monograph.sections?.length || 5) + 1}.</span>
                        <span>Integrative Conclusion &amp; Strategic Roadmap</span>
                      </h2>
                      <div className="text-justify leading-relaxed text-black space-y-3">
                        <ReactMarkdown
                          components={{
                            h3: ({ children }) => (
                              <h3 className="text-[11pt] font-bold text-black mt-5 mb-2">
                                {children}
                              </h3>
                            ),
                            p: ({ children }) => (
                              <p className="mb-3.5 text-justify leading-relaxed text-[10pt] text-black">
                                {children}
                              </p>
                            ),
                          }}
                        >
                          {formatCitations(monograph.conclusion, monograph.doc_names)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  <hr className="my-8 border-black/40" />

                  {/* References (\begin{thebibliography}) */}
                  <div className="pdf-section my-8 avoid-break">
                    <h2 className="text-[13pt] font-bold text-black tracking-tight mb-4">
                      References
                    </h2>
                    <div className="space-y-2.5 text-[9pt] text-black">
                      {monograph.doc_names?.map((doc, i) => (
                        <div key={i} className="latex-bib-entry flex items-start gap-2.5 leading-relaxed">
                          <span className="font-bold shrink-0 font-mono">[{i + 1}]</span>
                          <div>
                            <span className="font-semibold text-black">{doc}</span>.
                            <span className="italic text-zinc-900"> ScholarsMate Workspace Primary Corpus</span>, {new Date().getFullYear()}.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty state */
                <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto text-zinc-500 space-y-3">
                  <BookOpen className="h-10 w-10 text-zinc-700 stroke-[1.5]" />
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Configure on the left and generate your review</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Select papers, set a focus, customise headings, then hit Generate.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}