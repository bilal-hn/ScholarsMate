import React, { useState } from 'react';
import { X, Copy, Check, Sparkles, Eye, Code, Terminal, Layers } from 'lucide-react';

export default function PromptInspectorModal({
  isOpen,
  onClose,
  modeObj,
  onCloneAsCustom
}) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('full'); // 'full' | 'directive' | 'base'

  if (!isOpen || !modeObj) return null;

  const basePrompt = `You are ScholarsMate, an elite, source-locked academic research assistant specializing in clear, authoritative, and context-grounded paper synthesis.

### Intent & General Guidelines:
1. CONVERSATIONAL INTENT: Respond naturally and concisely as ScholarsMate.
2. ACADEMIC & RESEARCH INTENT: Provide a comprehensive, well-structured analysis based strictly on the provided RETRIEVED CONTEXT.
3. INLINE CITATIONS: Append citations using format: [Doc_Name, p.X]. Never wrap citations inside backticks.
4. MARKDOWN TABLES: Whenever comparing papers, models, or datasets, ALWAYS generate a clean Markdown table.
5. CODE & FORMULAS: Format code/equations inside syntax-highlighted Markdown blocks. Never invent ungrounded code.
6. STRICT FALLBACK: If retrieved context contains zero relevant facts, output: "I could not find sufficient information regarding this question in the provided document context."`;

  const modeDirective = modeObj.prompt_directive || modeObj.description || '';
  
  const fullEnvelope = `${basePrompt}\n\n${modeDirective}\n\n### RETRIEVED CONTEXT FROM PAPERS:\n{retrieved_paper_context_chunks}\n\n---\n### USER QUESTION:\n{user_prompt}\n\n### ACADEMIC SYNTHESIS:`;

  const textToDisplay = activeTab === 'directive' ? modeDirective : activeTab === 'base' ? basePrompt : fullEnvelope;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToDisplay);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  const IconComponent = modeObj.icon || Sparkles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">{modeObj.name}</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  {modeObj.isCustom ? 'Custom Lens' : 'Core Academic Lens'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">{modeObj.tagline || modeObj.description}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-zinc-950/40 border-b border-zinc-800/60 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('full')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                activeTab === 'full' 
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Full Assembled Prompt
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('directive')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                activeTab === 'directive' 
                  ? 'bg-zinc-800 text-amber-300 shadow-xs' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Mode Directives Only
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('base')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                activeTab === 'base' 
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Base Source-Locked Rules
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Copy Prompt</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Prompt Content View */}
        <div className="flex-1 p-5 overflow-y-auto bg-zinc-950/80 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
          {textToDisplay}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/90 text-xs">
          <div className="text-zinc-500 text-[11px] flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-zinc-400" />
            <span>Temperature: <strong className="text-zinc-300">{modeObj.temperature ?? 0.0}</strong> | Top-K: <strong className="text-zinc-300">{modeObj.top_k ?? 8}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            {onCloneAsCustom && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCloneAsCustom(modeObj);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-medium transition-colors cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Clone as Custom Lens</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
