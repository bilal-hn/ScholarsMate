import React, { useState, useMemo, useRef } from 'react';
import { 
  BookOpen, 
  X, 
  Sparkles, 
  CheckSquare, 
  Square, 
  Download, 
  Loader2,
  ListTree,
  FileCheck2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import html2pdf from 'html2pdf.js';

export default function LiteratureReviewModal({ 
  isOpen, 
  onClose, 
  documents = [], 
  selectedDocs = [],
  currentModel,
  customKeys,
  onGenerateReview 
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentStage, setCurrentStage] = useState('');
  const [monograph, setMonograph] = useState(null);

  // Markdown table preprocessor to convert text pipes to structured HTML
  const preprocessTables = (content) => {
    if (!content || !content.includes('|')) return content;

    const lines = content.split('\n');
    let inTable = false;
    let htmlOutput = [];
    let tableRows = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (/^\|[\s\-:]+(\|[\s\-:]+)*\|$/.test(trimmed)) {
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

    const headerHtml = `<thead><tr>${header
      .map((h) => `<th style="background-color: #f8fafc; color: #0f172a; padding: 7px 9px; border: 1px solid #cbd5e1; font-weight: 700; font-size: 8.5pt; text-align: left;">${h}</th>`)
      .join('')}</tr></thead>`;

    const bodyHtml = `<tbody>${body
      .map(
        (row) =>
          `<tr style="page-break-inside: avoid !important; break-inside: avoid !important;">${row
            .map((c) => `<td style="padding: 6px 9px; border: 1px solid #e2e8f0; color: #334155; font-size: 8pt; vertical-align: top; line-height: 1.45;">${c}</td>`)
            .join('')}</tr>`
      )
      .join('')}</tbody>`;

    return `<div class="pdf-table-wrap" style="overflow-x: auto; margin: 16px 0; page-break-inside: auto !important; break-inside: auto !important;"><table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${headerHtml}${bodyHtml}</table></div>`;
  };

  if (!isOpen) return null;

  const togglePaper = (docName) => {
    setActivePapers((prev) => 
      prev.includes(docName) 
        ? prev.filter((d) => d !== docName) 
        : [...prev, docName]
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
        custom_keys: customKeys
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

  const handleDownloadPDF = async () => {
    if (!printDocumentRef.current || isExporting) return;
    setIsExporting(true);

    const filename = `${(monograph?.title || 'Literature_Review').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    // Create an isolated printable clone with strict dimensions
    const element = printDocumentRef.current;
    const clonedElement = element.cloneNode(true);
    
    clonedElement.style.width = '680px';
    clonedElement.style.margin = '0 auto';
    clonedElement.style.padding = '0';
    clonedElement.style.backgroundColor = '#ffffff';
    clonedElement.style.color = '#0f172a';
    clonedElement.style.boxSizing = 'border-box';

    // Inject print layout rules
    const printStyles = document.createElement('style');
    printStyles.innerHTML = `
      * {
        box-sizing: border-box !important;
      }
      body, div, p, span {
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .pdf-section {
        page-break-inside: auto !important;
        break-inside: auto !important;
        margin-bottom: 22px !important;
      }
      h1, h2, h3, h4 {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      h1 {
        font-size: 18pt !important;
        font-weight: 800 !important;
        color: #0f172a !important;
        margin-bottom: 12px !important;
        line-height: 1.3 !important;
      }
      h2 {
        font-size: 13pt !important;
        font-weight: 700 !important;
        color: #9a3412 !important;
        margin-top: 24px !important;
        margin-bottom: 10px !important;
        padding-bottom: 4px !important;
        border-bottom: 1.5px solid #e2e8f0 !important;
      }
      h3 {
        font-size: 10.5pt !important;
        font-weight: 700 !important;
        color: #1e293b !important;
        margin-top: 14px !important;
        margin-bottom: 6px !important;
      }
      p {
        font-size: 9.5pt !important;
        line-height: 1.6 !important;
        color: #334155 !important;
        margin-bottom: 10px !important;
        text-align: justify !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      li {
        font-size: 9pt !important;
        line-height: 1.55 !important;
        color: #334155 !important;
        margin-bottom: 5px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      blockquote {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        border-left: 3px solid #f59e0b !important;
        background-color: #fffbeb !important;
        padding: 6px 12px !important;
        margin: 12px 0 !important;
        font-style: italic !important;
        font-size: 8.5pt !important;
        color: #4b5563 !important;
      }
      table {
        page-break-inside: auto !important;
        break-inside: auto !important;
        width: 100% !important;
        border-collapse: collapse !important;
        margin: 14px 0 !important;
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
      hr {
        border: none !important;
        border-top: 1px solid #e2e8f0 !important;
        margin: 20px 0 !important;
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
        windowWidth: 680,
        ignoreElements: (node) => node.tagName === 'BUTTON',
        onclone: (clonedDoc) => {
          // Remove global modern CSS stylesheets that use oklch to prevent canvas crashes
          const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
          styles.forEach((s) => {
            if (s.innerHTML && s.innerHTML.includes('oklch')) {
              s.remove();
            }
          });
        }
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { 
        mode: ['css', 'legacy'],
        avoid: ['h1', 'h2', 'h3', 'tr', 'blockquote', '.avoid-break', 'li'] 
      }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Top App Header */}
        <div className="px-6 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                Literature Review Studio
                <span className="text-[10px] font-mono bg-amber-400/10 text-amber-300 border border-amber-400/20 px-2 py-0.5 rounded-full">
                  Monograph Generator
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Multi-document synthesis, comparative matrices, and formal academic PDF monographs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Studio Workspace */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Side: Controls & Document Selection */}
          <div className="w-80 border-r border-zinc-800/80 p-5 flex flex-col justify-between bg-zinc-900/20 overflow-y-auto shrink-0">
            <div className="space-y-5">
              
              {/* Scope Selection */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-2">
                  1. Workspace Scope ({activePapers.length}/{normalizedDocList.length})
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {normalizedDocList.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">No papers found in active workspace.</p>
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
                              ? 'bg-amber-400/10 border border-amber-400/30 text-amber-200' 
                              : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-zinc-300'
                          }`}
                        >
                          {selected ? <CheckSquare className="h-3.5 w-3.5 text-amber-400 shrink-0" /> : <Square className="h-3.5 w-3.5 text-zinc-500 shrink-0" />}
                          <span className="truncate">{docName}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Research Focus */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-2">
                  2. Research Directive (Optional)
                </label>
                <textarea
                  value={researchFocus}
                  onChange={(e) => setResearchFocus(e.target.value)}
                  placeholder="e.g. Focus on accuracy trade-offs, retrieval latency, and experimental benchmark datasets."
                  className="w-full h-24 bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50 resize-none"
                />
              </div>

              {/* Monograph Structure Spec */}
              <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1 text-[11px] text-zinc-400">
                <div className="text-zinc-200 font-semibold mb-1 flex items-center gap-1.5">
                  <ListTree className="h-3.5 w-3.5 text-amber-400" /> Monograph Outline:
                </div>
                <div>• Title Header & Metadata</div>
                <div>• Table of Contents Page</div>
                <div>• Executive Abstract & Foundations</div>
                <div>• Methodological Comparison Matrix</div>
                <div>• Thematic Synthesis & Benchmarks</div>
                <div>• Critical Gaps & Open Trajectories</div>
                <div>• Integrative Conclusion</div>
                <div>• Complete Bibliography Catalog</div>
              </div>

            </div>

            {/* Generate Action Button */}
            <button
              type="button"
              onClick={handleStartSynthesis}
              disabled={isGenerating || activePapers.length === 0}
              className={`w-full py-3 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all mt-4 ${
                isGenerating || activePapers.length === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-lg hover:shadow-amber-400/10 cursor-pointer font-semibold'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-950" />
                  <span>Synthesizing Monograph...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Synthesize Monograph</span>
                </>
              )}
            </button>
          </div>

          {/* Right Side: Document Reader & PDF Export Hub */}
          <div className="flex-1 flex flex-col bg-zinc-900/30 overflow-hidden">
            
            {/* Top Action Bar */}
            {monograph && (
              <div className="px-6 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80 shrink-0">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-zinc-300 font-medium">
                    Publication-Grade Monograph Ready ({monograph.doc_names?.length || activePapers.length} Papers)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDownloadPDF}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-xl transition-colors cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    <span>{isExporting ? 'Compiling PDF...' : 'Download PDF Monograph'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Document Reader Container (A4 Paper View) */}
            <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-zinc-900/50">
              {isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                  <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse">
                    <Loader2 className="h-7 w-7 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">Synthesizing Literature Monograph</h3>
                    <p className="text-xs text-zinc-400 font-mono mt-2">{currentStage}</p>
                  </div>
                  <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-amber-400 h-full w-2/3 animate-pulse rounded-full" />
                  </div>
                </div>
              ) : monograph ? (
                
                /* Rendered A4 Publication Document */
                <div 
                  ref={printDocumentRef}
                  className="w-full max-w-3xl bg-white text-zinc-900 p-12 shadow-2xl rounded-sm font-serif leading-relaxed text-[11pt]"
                  style={{ minHeight: '1100px' }}
                >
                  {/* Formal Academic Header */}
                  <div className="pdf-section border-b-2 border-zinc-900 pb-6 mb-8 text-center font-sans">
                    <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-semibold block mb-2">
                      ScholarsMate Academic Monograph Series
                    </span>
                    <h1 className="text-2xl font-bold text-zinc-900 leading-tight mb-3">
                      {monograph.title}
                    </h1>
                    <div className="text-xs text-zinc-600 flex items-center justify-center gap-4 mt-2">
                      <span><strong>Scope:</strong> {monograph.doc_names?.length} Research Papers</span>
                      <span>•</span>
                      <span><strong>Synthesized:</strong> August 2026</span>
                    </div>
                    {monograph.research_focus && (
                      <div className="mt-4 p-3 bg-zinc-50 border border-zinc-200 rounded text-left text-xs italic text-zinc-700 avoid-break">
                        <strong>Research Directive:</strong> {monograph.research_focus}
                      </div>
                    )}
                  </div>

                  {/* Table of Contents */}
                  <div className="pdf-section my-8 p-6 bg-zinc-50 border border-zinc-200 rounded font-sans avoid-break">
                    <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-3 border-b border-zinc-300 pb-1">
                      Table of Contents
                    </h3>
                    <div className="space-y-1.5 text-xs text-zinc-800">
                      {monograph.sections?.map((sec, i) => (
                        <div key={i} className="flex justify-between items-center py-0.5">
                          <span><strong>Section {sec.section_number}:</strong> {sec.title}</span>
                          <span className="text-zinc-400">....................................................................</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center py-0.5">
                        <span><strong>Methodological Comparison Matrix</strong></span>
                        <span className="text-zinc-400">....................................................................</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span><strong>Integrative Conclusion & Future Roadmap</strong></span>
                        <span className="text-zinc-400">....................................................................</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span><strong>References & Document Catalog</strong></span>
                        <span className="text-zinc-400">....................................................................</span>
                      </div>
                    </div>
                  </div>

                  <hr className="my-8 border-zinc-200" />

                  {/* Core Monograph Sections */}
                  {monograph.sections?.map((sec, idx) => (
                    <div key={idx} className="pdf-section my-8">
                      <h2 className="text-base font-bold text-amber-900 font-sans tracking-tight border-b border-zinc-200 pb-1.5 mb-4">
                        Section {sec.section_number}: {sec.title}
                      </h2>
                      <div className="text-justify leading-relaxed text-zinc-800 space-y-3">
                        <ReactMarkdown
                          rehypePlugins={[rehypeRaw]}
                          components={{
                            h3: ({ children }) => <h3 className="text-sm font-bold text-zinc-900 mt-4 mb-2 font-sans">{children}</h3>,
                            p: ({ children }) => <p className="mb-3 text-justify leading-relaxed">{children}</p>,
                            blockquote: ({ children }) => <blockquote className="border-l-2 border-amber-600 pl-3 italic text-zinc-600 my-2">{children}</blockquote>,
                          }}
                        >
                          {preprocessTables(sec.content)}
                        </ReactMarkdown>
                      </div>

                      {/* Methodological Matrix inserted after Section 2 */}
                      {idx === 1 && monograph.matrix_table && (
                        <div className="pdf-section my-8">
                          <h3 className="text-sm font-bold text-zinc-900 font-sans mb-3 uppercase tracking-wider avoid-break">
                            Methodological Comparison Matrix
                          </h3>
                          <div dangerouslySetInnerHTML={{ __html: preprocessTables(monograph.matrix_table) }} />
                        </div>
                      )}
                    </div>
                  ))}

                  <hr className="my-8 border-zinc-200" />

                  {/* Section 6: Integrative Conclusion */}
                  {monograph.conclusion && (
                    <div className="pdf-section my-8">
                      <h2 className="text-base font-bold text-amber-900 font-sans tracking-tight border-b border-zinc-200 pb-1.5 mb-4">
                        Section 6: Integrative Conclusion & Future Roadmap
                      </h2>
                      <div className="text-justify leading-relaxed text-zinc-800 space-y-3">
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-3 text-justify leading-relaxed">{children}</p>,
                          }}
                        >
                          {monograph.conclusion}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  <hr className="my-8 border-zinc-200" />

                  {/* References & Document Catalog */}
                  <div className="pdf-section my-8 font-sans avoid-break">
                    <h2 className="text-base font-bold text-zinc-900 tracking-tight border-b border-zinc-200 pb-1.5 mb-4">
                      References & Primary Document Catalog
                    </h2>
                    <ul className="text-xs text-zinc-700 space-y-2 list-disc pl-5">
                      {monograph.doc_names?.map((doc, idx) => (
                        <li key={idx} className="leading-relaxed">
                          <strong className="text-zinc-900">[{idx + 1}]</strong> {doc} — Indexed & verified in ScholarsMate Knowledge Base.
                        </li>
                      ))}
                    </ul>
                  </div>

                </div>

              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto text-zinc-500 space-y-3">
                  <BookOpen className="h-10 w-10 text-zinc-700 stroke-[1.5]" />
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Ready to synthesize your monograph</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Select your target papers on the left and click Synthesize to generate a publication-ready literature review PDF.
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