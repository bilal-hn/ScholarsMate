import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BookOpen,
  X,
  Sparkles,
  CheckSquare,
  Square,
  Download,
  Loader2,
  GripVertical,
  Maximize2,
  Minimize2,
  RotateCcw,
  Plus,
  FileCode,
  FileText,
  Layers,
  AlertCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import ChessPieceLoader from '../common/ChessPieceLoader';
import { formatCitations, preprocessTables } from '../../utils/exportMonographPdf';
import { exportLiteratureReviewPdfAPI, exportLiteratureReviewZipAPI, fetchLiteratureReviewPdfBlobAPI } from '../../services/api';

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
  sessionId = null,
  onGenerateReview,
  initialMonograph = null,
  onReviewGenerated = null,
  onSaveMonograph = null,
  mode = 'modal', // 'modal' (fullscreen overlay) | 'panel' (inline right panel)
  isFullscreen = false,
  onToggleFullscreen = null,
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
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [currentStage, setCurrentStage] = useState('');
  const [monograph, setMonograph] = useState(() => initialMonograph || null);
  const [docDisplayMode, setDocDisplayMode] = useState('pdf'); // 'pdf' (compiled XeTeX vector PDF) | 'web' (HTML reader)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isCompilingPreview, setIsCompilingPreview] = useState(false);
  const [previewCompileError, setPreviewCompileError] = useState(null);

  useEffect(() => {
    if (initialMonograph !== undefined) {
      setMonograph(initialMonograph);
    }
  }, [initialMonograph]);

  // Automatically compile or fetch the XeTeX vector PDF for in-panel preview whenever monograph is ready
  useEffect(() => {
    let active = true;
    if (monograph && monograph.sections && monograph.sections.length > 0) {
      setIsCompilingPreview(true);
      setPreviewCompileError(null);
      fetchLiteratureReviewPdfBlobAPI(monograph)
        .then((blob) => {
          if (active) {
            const url = URL.createObjectURL(blob);
            setPdfPreviewUrl(url);
          }
        })
        .catch((err) => {
          if (active) {
            console.error('Failed to compile XeTeX PDF for preview:', err);
            setPreviewCompileError(err.response?.data?.detail || err.message || 'XeTeX Compilation error');
          }
        })
        .finally(() => {
          if (active) setIsCompilingPreview(false);
        });
    } else {
      setPdfPreviewUrl(null);
      setPreviewCompileError(null);
    }
    return () => {
      active = false;
    };
  }, [monograph]);

  // Keep papers synced if documents load after mount
  useEffect(() => {
    if (activePapers.length === 0 && normalizedDocList.length > 0) {
      setActivePapers(normalizedDocList);
    }
  }, [normalizedDocList]);

  if (!isOpen) return null;

  const togglePaper = (docName) => {
    setActivePapers((prev) =>
      prev.includes(docName) ? prev.filter((d) => d !== docName) : [...prev, docName]
    );
  };

  const handleSelectAllPapers = () => {
    setActivePapers([...normalizedDocList]);
  };

  const handleClearPapers = () => {
    setActivePapers([]);
  };

  const handleNewReview = () => {
    setMonograph(null);
    setPdfPreviewUrl(null);
  };

  const handleDownloadPDF = async () => {
    if (!monograph || isExporting) return;
    setIsExporting(true);
    try {
      // 1. Compile crisp vector XeTeX PDF via backend Tectonic
      await exportLiteratureReviewPdfAPI(monograph);
    } catch (err) {
      console.error('XeTeX PDF download failed:', err);
      alert('Failed to compile publication-grade XeTeX PDF: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!monograph || isExportingZip) return;
    setIsExportingZip(true);
    try {
      await exportLiteratureReviewZipAPI(monograph);
    } catch (err) {
      console.error('LaTeX zip download failed:', err);
      alert('Failed to package LaTeX project: ' + (err.message || 'Server error'));
    } finally {
      setIsExportingZip(false);
    }
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
        session_id: sessionId,
      };

      const data = await onGenerateReview(payload);
      setMonograph(data);
      if (onReviewGenerated) {
        onReviewGenerated(data);
      }
      if (onSaveMonograph) {
        onSaveMonograph(data);
      }
    } catch (err) {
      alert(`Synthesis Failed: ${err.message || 'Error generating review.'}`);
    } finally {
      setIsGenerating(false);
      setCurrentStage('');
    }
  };

  const isPanel = mode === 'panel';
  const synthesizedDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Determine which mutually exclusive view to display:
  // 1. 'loading' when generating
  // 2. 'monograph' when monograph data is loaded and not generating
  // 3. 'config' when initial empty/configuration state
  const viewMode = isGenerating ? 'loading' : monograph ? 'monograph' : 'config';

  const innerContent = (
    <div className="h-full w-full flex flex-col overflow-hidden bg-zinc-950">
      {/* ── Top Header Bar ── */}
      <div className={`px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between shrink-0 ${isPanel ? 'bg-zinc-950' : 'bg-zinc-900/60'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold text-zinc-100 truncate">
            {viewMode === 'monograph' ? (monograph.title || 'Literature Review') : 'Literature Review Studio'}
          </span>
          {viewMode === 'monograph' && (
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5 leading-none shrink-0 font-medium">
              Ready · {(monograph.doc_names || activePapers).length} papers
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {viewMode === 'monograph' && (
            <>
              {/* Segmented display switch: XeTeX PDF Preview vs Web Reader */}
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[11px] mr-1">
                <button
                  type="button"
                  onClick={() => setDocDisplayMode('pdf')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    docDisplayMode === 'pdf'
                      ? 'bg-amber-400 text-zinc-950 font-semibold shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200 font-medium'
                  }`}
                  title="View compiled publication-grade vector XeTeX PDF"
                >
                  <FileText className="h-3 w-3" />
                  <span>XeTeX PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDocDisplayMode('web')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    docDisplayMode === 'web'
                      ? 'bg-amber-400 text-zinc-950 font-semibold shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200 font-medium'
                  }`}
                  title="View interactive HTML document reader"
                >
                  <Layers className="h-3 w-3" />
                  <span>Web Reader</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleNewReview}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors cursor-pointer"
                title="Create a new review (reset to parameters)"
              >
                <Plus className="h-3 w-3 text-amber-400" />
                <span>New Review</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={isExporting}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Download publication-grade vector XeTeX PDF (compiled with Tectonic)"
              >
                {isExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                <span>{isExporting ? 'Compiling…' : 'Download PDF'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={isExportingZip}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Download complete LaTeX Project (.zip) for Overleaf / TeXStudio"
              >
                {isExportingZip ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3 text-emerald-400" />}
                <span>{isExportingZip ? 'Packaging…' : 'LaTeX (.zip)'}</span>
              </button>
            </>
          )}

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="h-7 w-7 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 flex items-center justify-center transition-colors cursor-pointer"
              title={isFullscreen ? 'Restore split panel' : 'Expand full screen'}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 flex items-center justify-center transition-colors cursor-pointer"
            title="Close Literature Review"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Mutually Exclusive View Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ============================================================== */}
        {/* VIEW 1: LOADING SCREEN                                        */}
        {/* ============================================================== */}
        {viewMode === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto space-y-5 animate-in fade-in duration-200">
            <div className="h-20 w-20 rounded-3xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-center shadow-2xl">
              <ChessPieceLoader size="lg" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Synthesizing Literature Review</h3>
              <p className="text-xs text-amber-400/90 font-mono mt-2">{currentStage}</p>
            </div>
            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800">
              <div className="bg-amber-400 h-full w-2/3 animate-pulse rounded-full" />
            </div>
            <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed">
              Performing multi-document Map-Reduce synthesis, methodological matrix cross-comparison, and bracket citation verification.
            </p>
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: MONOGRAPH DOCUMENT (XeTeX PDF Preview & Web Reader)     */}
        {/* ============================================================== */}
        {viewMode === 'monograph' && monograph && (
          docDisplayMode === 'pdf' ? (
            <div className="flex-1 w-full h-full bg-zinc-950 flex flex-col overflow-hidden relative">
              {isCompilingPreview && !pdfPreviewUrl && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/90 text-center p-6 space-y-4 animate-in fade-in duration-200">
                  <div className="h-16 w-16 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-center shadow-xl">
                    <ChessPieceLoader size="md" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100">Compiling XeTeX Vector Monograph</h4>
                    <p className="text-xs text-amber-400/90 font-mono mt-1.5">Executing Tectonic engine with publication page breaks...</p>
                  </div>
                  <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed">
                    Generating Latin Modern Roman typography, dynamic table of contents, and booktabs tables.
                  </p>
                </div>
              )}

              {previewCompileError && !pdfPreviewUrl && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4 animate-in fade-in duration-200">
                  <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100">XeTeX Compilation Notice</h4>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{previewCompileError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDocDisplayMode('web')}
                    className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
                  >
                    Switch to Web Reader
                  </button>
                </div>
              )}

              {pdfPreviewUrl && (
                <iframe
                  src={pdfPreviewUrl}
                  title="XeTeX Compiled Monograph PDF"
                  className="w-full h-full border-0 bg-zinc-900"
                />
              )}
            </div>
          ) : (
          <div className={`flex-1 overflow-y-auto ${isPanel ? 'p-3 md:p-6' : 'p-8'} flex justify-center bg-zinc-900/30`}>
            <div
              ref={printDocumentRef}
              className={`w-full ${isPanel ? 'max-w-2xl px-6 py-8' : 'max-w-3xl p-12 md:p-16'} bg-white text-black shadow-2xl rounded-sm leading-relaxed`}
              style={{
                minHeight: '1100px',
                fontFamily: '"Latin Modern Roman", "Computer Modern", "Times New Roman", Times, "Nimbus Roman No9 L", serif',
                color: '#000000',
              }}
            >
              {/* LaTeX Header (\maketitle) */}
              <div className="pdf-section pb-6 mb-6 text-center">
                <span className="text-[9pt] tracking-[0.2em] uppercase font-bold text-black block mb-3">
                  ScholarsMate Academic Monograph Series
                </span>
                <h1 className="text-2xl md:text-3xl font-bold text-black leading-tight mb-3 tracking-normal">
                  {monograph.title}
                </h1>
                <div className="text-xs text-black flex items-center justify-center gap-3 mt-2">
                  <span>Corpus Synthesis across {(monograph.doc_names || activePapers).length} Primary Research Works</span>
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
                  {monograph.abstract ||
                    `This monograph presents an integrative, systematic synthesis of conceptual frameworks, architectural paradigms, empirical benchmarks, and unresolved limitations across ${(monograph.doc_names || activePapers).length} primary research works indexed in the ScholarsMate workspace. By reconciling conflicting methodological taxonomies and synthesizing empirical evidence across comparative axes, this work formalizes the core tradeoffs and outlines foundational trajectories for ongoing inquiry.`}
                </p>
                {monograph.research_focus && (
                  <div className="text-[9pt] text-black pt-1">
                    <span className="font-bold not-italic">Keywords &amp; Focus Directive: </span>
                    <span className="italic">{monograph.research_focus}</span>
                  </div>
                )}
                <div className="text-[9pt] text-black pt-0.5">
                  <span className="font-bold not-italic">Primary Indexed Corpus: </span>
                  <span className="italic">{(monograph.doc_names || activePapers).join(', ')}</span>
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
                  <h2 className="text-[13pt] font-bold text-black tracking-tight mt-8 mb-3 flex items-baseline gap-2.5">
                    <span>{sec.section_number || idx + 1}.</span>
                    <span>{customHeadings[idx] || sec.title}</span>
                  </h2>
                  <div className="text-justify leading-relaxed text-black space-y-3">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
                      components={{
                        h3: ({ children }) => (
                          <h3 className="text-[12pt] font-bold text-black mt-6 mb-2 border-b border-black/15 pb-0.5 tracking-tight">
                            {children}
                          </h3>
                        ),
                        h4: ({ children }) => (
                          <h4 className="text-[10.5pt] font-bold italic text-black mt-4 mb-1">
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
                      {formatCitations(preprocessTables(sec.content), monograph.doc_names || activePapers)}
                    </ReactMarkdown>
                  </div>

                  {/* Methodological matrix after section 2 */}
                  {idx === 1 && monograph.matrix_table && (
                    <div className="pdf-section my-8 avoid-break">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: preprocessTables(formatCitations(monograph.matrix_table, monograph.doc_names || activePapers)),
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}

              <hr className="my-8 border-black/40" />

              {/* Conclusion */}
              {monograph.conclusion && (
                <div className="pdf-section my-8">
                  <h2 className="text-[13pt] font-bold text-black tracking-tight mt-8 mb-3 flex items-baseline gap-2.5">
                    <span>{(monograph.sections?.length || 5) + 1}.</span>
                    <span>Integrative Conclusion &amp; Strategic Roadmap</span>
                  </h2>
                  <div className="text-justify leading-relaxed text-black space-y-3">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeRaw, rehypeKatex]}
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
                      {formatCitations(monograph.conclusion, monograph.doc_names || activePapers)}
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
                  {(monograph.doc_names || activePapers).map((doc, i) => (
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
          </div>
          )
        )}

        {/* ============================================================== */}
        {/* VIEW 3: CONFIGURATION FORM (SINGLE FULL-WIDTH PANEL)           */}
        {/* ============================================================== */}
        {viewMode === 'config' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Introduction Banner */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span>Synthesize Literature Review</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Select research papers from your workspace, define an optional focus angle, and generate an academic monograph with publication-grade LaTeX typesetting.
                </p>
              </div>

              {/* Section 1: Papers */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">Corpus Documents</span>
                    <span className="text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5 font-mono">
                      {activePapers.length} of {normalizedDocList.length} selected
                    </span>
                  </div>
                  {normalizedDocList.length > 0 && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={handleSelectAllPapers}
                        className="text-amber-400 hover:text-amber-300 font-medium transition-colors cursor-pointer"
                      >
                        Select all
                      </button>
                      <span className="text-zinc-600">•</span>
                      <button
                        type="button"
                        onClick={handleClearPapers}
                        className="text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {normalizedDocList.length === 0 ? (
                    <div className="p-4 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
                      <p className="text-xs text-zinc-400">No documents found in workspace.</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Upload PDF documents to generate a literature review.</p>
                    </div>
                  ) : (
                    normalizedDocList.map((docName, idx) => {
                      const selected = activePapers.includes(docName);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => togglePaper(docName)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-left transition-all cursor-pointer ${
                            selected
                              ? 'bg-amber-500/10 border border-amber-500/40 text-zinc-100 font-medium shadow-xs'
                              : 'bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {selected ? (
                            <CheckSquare className="h-4 w-4 text-amber-400 shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-zinc-600 shrink-0" />
                          )}
                          <span className="truncate">{docName}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Section 2: Research Focus */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-200 block">
                  Research Focus <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={researchFocus}
                  onChange={(e) => setResearchFocus(e.target.value)}
                  placeholder="e.g. Compare physiological mechanisms, empirical methodologies, dosage variations, and critical contradictions across the selected literature."
                  className="w-full bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 focus:border-amber-400/50 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* Section 3: Headings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">Section Headings</span>
                    <span className="text-[10px] text-zinc-500">(editable)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomHeadings([...DEFAULT_HEADINGS])}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    title="Reset to default academic sections"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {customHeadings.map((heading, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                      <span className="text-[11px] font-mono text-zinc-500 w-4 shrink-0">{idx + 1}.</span>
                      <input
                        type="text"
                        value={heading}
                        onChange={(e) => {
                          const updated = [...customHeadings];
                          updated[idx] = e.target.value;
                          setCustomHeadings(updated);
                        }}
                        className="flex-1 text-xs bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 focus:border-amber-400/40 rounded-xl px-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-none transition-colors"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  These define the analytical taxonomy and sections synthesized in your review.
                </p>
              </div>

              {/* Generate Button */}
              <div className="pt-2 pb-6">
                <button
                  type="button"
                  onClick={handleStartSynthesis}
                  disabled={isGenerating || activePapers.length === 0}
                  className={`w-full py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                    isGenerating || activePapers.length === 0
                      ? 'bg-zinc-900 text-zinc-500 border border-zinc-800 cursor-not-allowed'
                      : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-amber-500/10 cursor-pointer hover:scale-[1.01] active:scale-[0.99]'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Literature Review</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Panel mode: inline right-panel
  if (isPanel) {
    return (
      <div className="h-full w-full flex flex-col bg-zinc-950 overflow-hidden animate-in slide-in-from-right-5 duration-200">
        {innerContent}
      </div>
    );
  }

  // Modal mode: fullscreen overlay
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {innerContent}
      </div>
    </div>
  );
}
