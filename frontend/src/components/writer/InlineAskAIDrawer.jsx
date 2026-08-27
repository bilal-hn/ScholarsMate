import React, { useState } from 'react';
import { X, Sparkles, Send, ArrowRight, CornerDownLeft, Copy, Check, ChevronDown, ChevronRight, Loader2, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * In-editor AI assistant drawer for querying, expanding, critiquing, or rewriting highlighted text.
 */
export default function InlineAskAIDrawer({
  isOpen,
  onClose,
  selection,
  onSubmitPrompt,
  isLoading,
  aiResult,
  thinkingProcess,
  onReplaceSelection,
  onInsertBelow,
}) {
  const [instruction, setInstruction] = useState('');
  const [showThinking, setShowThinking] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const presets = [
    { label: 'Critique claim', prompt: 'Critique this claim for methodological rigor and potential counter-arguments.' },
    { label: 'Elaborate academically', prompt: 'Elaborate on this point into two well-developed academic sentences with supporting reasoning.' },
    { label: 'Shorten & clarify', prompt: 'Concise rewrite: tighten this sentence to be punchy, clear, and formal.' },
    { label: 'Formal academic tone', prompt: 'Rewrite in formal, peer-reviewed academic tone.' },
    { label: 'Format LaTeX math', prompt: 'Convert any formulas or mathematical concepts mentioned into clean LaTeX math notation.' },
  ];

  const handleSend = (customText) => {
    const textToSend = customText || instruction;
    if (!textToSend.trim()) return;
    onSubmitPrompt(textToSend);
    setInstruction('');
  };

  const handleCopy = () => {
    if (!aiResult) return;
    navigator.clipboard.writeText(aiResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-zinc-950/98 border-l border-zinc-800 shadow-2xl backdrop-blur-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200 font-sans">
      {/* 1. Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">In-Editor AI Assistant</h3>
            <p className="text-[11px] text-zinc-400">Context-anchored to highlighted text</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Pinned Selection Context Banner */}
      <div className="p-3.5 bg-zinc-900/60 border-b border-zinc-800/80">
        <div className="text-[11px] font-mono text-purple-300/80 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-purple-400" />
          <span>Focal Passage:</span>
        </div>
        <p className="text-xs text-zinc-200 italic line-clamp-3 bg-zinc-950/70 p-2 rounded-lg border border-zinc-800">
          "{selection}"
        </p>
      </div>

      {/* 3. Preset Action Chips */}
      <div className="p-3 border-b border-zinc-800/60 flex flex-wrap gap-1.5 bg-zinc-900/30">
        {presets.map((preset, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(preset.prompt)}
            disabled={isLoading}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-700/60 hover:border-purple-500/40 transition-all cursor-pointer disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* 4. Scrollable Result Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            <p className="text-xs">Generating response bounded to workspace documents...</p>
          </div>
        ) : aiResult ? (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Thinking Process Accordion (if reasoning trace exists) */}
            {thinkingProcess && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setShowThinking(!showThinking)}
                  className="w-full px-3 py-2 flex items-center justify-between text-zinc-400 hover:text-zinc-200 bg-zinc-900/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Brain className="h-3.5 w-3.5 text-purple-400" />
                    <span>View reasoning process</span>
                  </div>
                  {showThinking ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                {showThinking && (
                  <div className="p-3 text-[11.5px] font-mono text-zinc-400 bg-zinc-950/80 border-t border-zinc-800/60 whitespace-pre-wrap leading-relaxed">
                    {thinkingProcess}
                  </div>
                )}
              </div>
            )}

            {/* Generated AI Content */}
            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-700/80 text-zinc-200 text-xs leading-relaxed prose prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {aiResult}
              </ReactMarkdown>
            </div>

            {/* Action Buttons: Replace / Insert Below / Copy */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onReplaceSelection(aiResult)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                <span>Replace Selection</span>
              </button>

              <button
                type="button"
                onClick={() => onInsertBelow(aiResult)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700 transition-all active:scale-95 cursor-pointer"
                title="Insert on next line"
              >
                <CornerDownLeft className="h-3.5 w-3.5" />
                <span>Insert Below</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors cursor-pointer"
                title="Copy to clipboard"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-500 gap-2">
            <Sparkles className="h-8 w-8 text-zinc-700" />
            <p className="text-xs">Click a preset above or type a custom instruction below.</p>
          </div>
        )}
      </div>

      {/* 5. Bottom Instruction Input Bar */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ask AI about highlighted text (e.g., 'Rewrite in 2 sentences')..."
            className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !instruction.trim()}
            className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-40 cursor-pointer shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
