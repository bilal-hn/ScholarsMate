import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Compass,
  User,
  FileText,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Copy,
  Check,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function ChatMessage({ message, onSelectCitation }) {
  const [showThinking, setShowThinking] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState(false);

  const isBot = message.sender === 'bot';

  // Format timestamp (e.g. "09:04 PM")
  const formatTime = (ts) => {
    if (!ts) return '';
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const timeString = formatTime(message.timestamp);

  // Clean model ID display (e.g. "gemini-3.7-flash", "gpt-4o-mini", etc.)
  const modelIdentifier =
    message.model_name ||
    message.meta?.model ||
    (isBot ? 'scholarsmate' : null);

  const cleanModelTag = modelIdentifier
    ? modelIdentifier
        .replace(/^models\//i, '')
        .replace(/^openai\//i, '')
        .replace(/^anthropic\//i, '')
        .replace(/^groq\//i, '')
        .replace(/^gemini\//i, '')
    : 'scholarsmate';

  // Extract telemetry metrics
  const responseTime = message.meta?.responseTime || null;
  const tokenCount = message.meta?.tokens !== undefined ? message.meta.tokens : null;

  // Calculate approximate token generation speed
  const calculateSpeed = () => {
    if (!tokenCount || !responseTime) return null;
    const sec = parseFloat(responseTime.replace('s', ''));
    if (isNaN(sec) || sec <= 0) return null;
    return Math.round(tokenCount / sec);
  };

  const speed = calculateSpeed();

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full flex flex-col items-center justify-center my-3 animate-in fade-in duration-200">
      {isBot ? (
        /* ===================================================================
           BOT RESPONSE CARD (Centralized, Odysseus / OpenWebUI Inspired)
           =================================================================== */
        <div className="w-full max-w-2xl bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl transition-all relative overflow-hidden backdrop-blur-sm">
          {/* Header: Model Badge + Timestamp */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/60 select-none">
            <div className="flex items-center gap-2">
              {/* Sleek Model Tag with @ prefix */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-zinc-300 font-mono text-[11.5px] font-medium shadow-2xs">
                <span className="text-amber-400 font-semibold text-xs">@</span>
                <span className="text-zinc-200 tracking-tight">{cleanModelTag}</span>
              </div>
            </div>

            {timeString && (
              <span className="text-[11px] font-mono text-zinc-500 font-normal">
                {timeString}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* Status Pill 1: Sources / Referenced Papers Accordion */}
            {message.sources && message.sources.length > 0 && (
              <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40 shadow-xs">
                <button
                  type="button"
                  onClick={() => setShowSources((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-950/60 hover:bg-zinc-950/90 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-mono text-[11.5px] text-zinc-300">
                      {message.sources.length} Referenced {message.sources.length === 1 ? 'Source' : 'Sources'}
                    </span>
                  </div>
                  {showSources ? (
                    <ChevronDown className="h-3 w-3 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-zinc-500" />
                  )}
                </button>

                {showSources && (
                  <div className="p-2.5 border-t border-zinc-800/60 bg-zinc-950/80 flex flex-wrap gap-1.5 animate-in fade-in duration-150">
                    {message.sources.map((src, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => onSelectCitation && onSelectCitation(src.doc_name, src.page_number)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 text-amber-300 hover:text-amber-200 px-2 py-1 rounded-lg transition-colors cursor-pointer group"
                        title={`Jump to page ${src.page_number} of ${src.doc_name}`}
                      >
                        <FileText className="h-3 w-3 text-amber-400 shrink-0 group-hover:scale-105 transition-transform" />
                        <span className="truncate max-w-[180px]">{src.doc_name}</span>
                        <span className="text-zinc-500 text-[10px]">p.{src.page_number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Status Pill 2: Thinking / Reasoning Trace Accordion */}
            {message.thinking_process && (
              <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/40 shadow-xs">
                <button
                  type="button"
                  onClick={() => setShowThinking((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-950/60 hover:bg-zinc-950/90 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                    <span className="font-sans text-[11.5px] font-medium text-zinc-300">
                      View thinking process
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {responseTime && (
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800">
                        {responseTime}
                      </span>
                    )}
                    {showThinking ? (
                      <ChevronDown className="h-3 w-3 text-zinc-400" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-zinc-500" />
                    )}
                  </div>
                </button>

                {showThinking && (
                  <div className="px-3.5 pb-3 pt-2 text-xs text-zinc-400 font-mono whitespace-pre-wrap border-t border-zinc-800/60 bg-zinc-950/90 max-h-56 overflow-y-auto leading-relaxed">
                    {message.thinking_process}
                  </div>
                )}
              </div>
            )}

            {/* Synthesized Response Body */}
            <div className="prose prose-invert max-w-none text-zinc-200 text-[13.5px] leading-relaxed tracking-normal font-sans pt-1">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-base font-bold text-zinc-100 mt-4 mb-2 tracking-tight border-b border-zinc-800 pb-1.5">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-zinc-100 mt-3 mb-1.5 tracking-tight border-b border-zinc-800/50 pb-1">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xs font-semibold text-amber-400 mt-2.5 mb-1 uppercase tracking-wider">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="my-2 text-zinc-300 leading-relaxed font-normal">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="my-2 space-y-1 pl-4 list-disc marker:text-amber-400/80">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-2 space-y-1 pl-4 list-decimal marker:text-amber-400/80">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-zinc-300 leading-relaxed pl-0.5">
                      {children}
                    </li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-zinc-100">{children}</strong>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-amber-500/80 pl-3 py-0.5 my-3 bg-amber-500/5 rounded-r-lg italic text-zinc-400 text-xs">
                      {children}
                    </blockquote>
                  ),

                  /* --- Native GFM Table Renderers --- */
                  table: ({ children }) => (
                    <div className="my-4 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-md">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          {children}
                        </table>
                      </div>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-zinc-800 border-b border-zinc-700/60 text-[10.5px] uppercase tracking-wider text-amber-400 font-semibold">
                      {children}
                    </thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-zinc-800/60 font-normal text-zinc-300">
                      {children}
                    </tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="hover:bg-zinc-800/40 transition-colors">
                      {children}
                    </tr>
                  ),
                  th: ({ children }) => (
                    <th className="py-2.5 px-3 font-semibold text-amber-400 text-left">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="py-2.5 px-3 leading-relaxed align-top">
                      {children}
                    </td>
                  ),

                  /* --- Code & Pre Blocks --- */
                  code: ({ inline, className, children, ...props }) => {
                    return inline ? (
                      <code className="bg-zinc-800/80 text-amber-300 font-mono text-[11.5px] px-1 py-0.5 rounded border border-zinc-700/60" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="font-mono text-xs text-zinc-200 block overflow-x-auto whitespace-pre-wrap" {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <div className="my-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 overflow-x-auto font-mono text-xs leading-relaxed text-zinc-200">
                      {children}
                    </div>
                  )
                }}
              >
                {message.text}
              </ReactMarkdown>
            </div>

            {/* Bottom Telemetry & Actions Footer Toolbar */}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-800/60 text-[11px] text-zinc-500 font-mono select-none">
              {/* Left: Telemetry Data (Tokens, Latency, Speed) */}
              <div className="flex items-center gap-2 flex-wrap">
                {tokenCount !== null && tokenCount > 0 && (
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Cpu className="h-3 w-3 text-zinc-500" />
                    <span>{tokenCount} tok</span>
                  </span>
                )}
                {responseTime && (
                  <>
                    <span className="text-zinc-700">|</span>
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Clock className="h-3 w-3 text-zinc-500" />
                      <span>{responseTime}</span>
                    </span>
                  </>
                )}
                {speed && (
                  <>
                    <span className="text-zinc-700">|</span>
                    <span className="text-zinc-500 flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5 text-amber-400/80" />
                      <span>{speed} tok/s</span>
                    </span>
                  </>
                )}
              </div>

              {/* Right: Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleCopy(message.text)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Copy response to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400 text-[10px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span className="text-[10px]">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ===================================================================
           USER PROMPT BUBBLE (Right-Aligned, Odysseus Style with Header)
           =================================================================== */
        <div className="w-full max-w-2xl flex flex-col items-end">
          <div className="w-full max-w-lg">
            {/* User Message Header */}
            <div className="flex items-center justify-between px-2 pb-1.5 text-[11px] font-mono text-zinc-500 select-none">
              <div className="flex items-center gap-1 text-zinc-400 font-medium">
                <span className="text-amber-400">•</span>
                <span>You</span>
              </div>
              {timeString && (
                <span>{timeString}</span>
              )}
            </div>

            {/* Bubble Content */}
            <div className="bg-zinc-900 hover:bg-zinc-900/95 text-zinc-100 border border-zinc-800 font-normal px-4 py-3 rounded-2xl shadow-md text-[13.5px] whitespace-pre-wrap leading-relaxed">
              {message.text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}