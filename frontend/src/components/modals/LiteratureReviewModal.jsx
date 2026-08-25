import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  X, 
  Sparkles, 
  CheckSquare, 
  Square, 
  FileText, 
  Layers, 
  Download, 
  Copy, 
  Check, 
  Loader2,
  ListTree
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

export default function LiteratureReviewModal({ 
  isOpen, 
  onClose, 
  documents = [], 
  selectedDocs = [],
  currentModel,
  customKeys,
  onGenerateReview 
}) {
  // Normalize documents to extract plain string names
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
  const [reviewDepth, setReviewDepth] = useState('detailed'); // 'executive' | 'detailed'
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStage, setCurrentStage] = useState('');
  const [reviewResult, setReviewResult] = useState(null);
  const [copied, setCopied] = useState(false);

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
    setCurrentStage('Analyzing document structure and synthesizing multi-stage taxonomy...');

    try {
      const payload = {
        doc_names: activePapers,
        research_focus: researchFocus.trim(),
        depth: reviewDepth,
        model_name: currentModel,
        custom_keys: customKeys
      };

      const data = await onGenerateReview(payload);
      setReviewResult(data);
    } catch (err) {
      alert(`Synthesis Failed: ${err.message || 'Error generating review.'}`);
    } finally {
      setIsGenerating(false);
      setCurrentStage('');
    }
  };

  const handleCopy = () => {
    if (!reviewResult?.content) return;
    navigator.clipboard.writeText(reviewResult.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!reviewResult?.content) return;
    const blob = new Blob([reviewResult.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Literature_Review_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                Literature Review Studio
                <span className="text-[11px] font-mono bg-amber-400/10 text-amber-300 border border-amber-400/20 px-2 py-0.5 rounded-full">
                  Thesis AI Mode
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Multi-document thematic synthesis, methodological comparison matrix & gap analysis
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

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Column: Configuration */}
          <div className="w-80 border-r border-zinc-800/70 p-5 flex flex-col justify-between bg-zinc-900/20 overflow-y-auto shrink-0">
            <div className="space-y-5">
              
              {/* Workspace Paper Scope */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-2">
                  1. Included Papers ({activePapers.length}/{normalizedDocList.length})
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {normalizedDocList.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">No papers uploaded in workspace.</p>
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
                  2. Research Question / Focus (Optional)
                </label>
                <textarea
                  value={researchFocus}
                  onChange={(e) => setResearchFocus(e.target.value)}
                  placeholder="e.g. Focus on benchmark accuracy tradeoffs, retrieval latency, and clinical evaluation."
                  className="w-full h-20 bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50 resize-none"
                />
              </div>

              {/* Review Depth Mode */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-2">
                  3. Review Depth
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewDepth('detailed')}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      reviewDepth === 'detailed'
                        ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold flex items-center gap-1">
                      <Layers className="h-3 w-3 text-amber-400" /> In-Depth
                    </span>
                    <span className="text-[10px] text-zinc-400">Full 5-Section Monograph</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewDepth('executive')}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      reviewDepth === 'executive'
                        ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold flex items-center gap-1">
                      <FileText className="h-3 w-3 text-amber-400" /> Executive
                    </span>
                    <span className="text-[10px] text-zinc-400">Fast Summary & Table</span>
                  </button>
                </div>
              </div>

              {/* Planned Checklist */}
              <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-1.5 text-[11px] text-zinc-400">
                <div className="text-zinc-300 font-medium mb-1 flex items-center gap-1">
                  <ListTree className="h-3 w-3 text-amber-400" /> Planned Sections:
                </div>
                <div>• Executive Abstract & Taxonomy</div>
                <div>• Comparative Matrix Table</div>
                <div>• Thematic Synthesis</div>
                <div>• Research Gaps & Open Problems</div>
              </div>

            </div>

            {/* Launch Button */}
            <button
              type="button"
              onClick={handleStartSynthesis}
              disabled={isGenerating || activePapers.length === 0}
              className={`w-full py-2.5 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all mt-4 ${
                isGenerating || activePapers.length === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-md hover:shadow-amber-400/10 cursor-pointer'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-950" />
                  <span>Synthesizing Review...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Review</span>
                </>
              )}
            </button>
          </div>

          {/* Right Column: Viewer */}
          <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
            
            {reviewResult && (
              <div className="px-6 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
                <span className="text-xs text-zinc-400 font-mono">
                  Synthesized across {activePapers.length} document(s)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-medium text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export (.md)</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-8">
              {isGenerating ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-200">Generating Literature Review</h3>
                    <p className="text-xs text-zinc-400 font-mono mt-2">{currentStage}</p>
                  </div>
                  <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-amber-400 h-full w-2/3 animate-pulse rounded-full" />
                  </div>
                </div>
              ) : reviewResult ? (
                <div className="prose prose-invert max-w-none text-zinc-200 text-sm leading-relaxed">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                    {reviewResult.content || reviewResult.answer || ''}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto text-zinc-500 space-y-3">
                  <BookOpen className="h-10 w-10 text-zinc-700 stroke-[1.5]" />
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Ready to synthesize your workspace</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Select your target papers on the left and configure your research focus to generate a comprehensive literature review.
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