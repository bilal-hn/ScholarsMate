import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Compass, User, FileText, Brain, ChevronDown, ChevronRight, Clock, Cpu } from 'lucide-react';

export default function ChatMessage({ message, onSelectCitation }) {
  const [showThinking, setShowThinking] = useState(false);
  const isBot = message.sender === 'bot';

  return (
    <div className={`flex gap-3.5 ${isBot ? 'justify-start' : 'justify-end'} w-full`}>
      {/* Bot Avatar */}
      {isBot && (
        <div className="h-7 w-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0 mt-1 shadow-xs">
          <Compass className="h-4 w-4 stroke-[2]" />
        </div>
      )}

      {/* Message Content Container */}
      <div className={`w-full max-w-2xl ${isBot ? 'pr-2' : ''}`}>
        {isBot ? (
          <div className="space-y-3.5">
            {/* Thinking Accordion */}
            {message.thinking_process && (
              <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-900 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowThinking((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors bg-zinc-900/90 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Brain className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                    <span className="font-sans text-[11.5px]">Reasoning Process</span>
                  </div>
                  {showThinking ? (
                    <ChevronDown className="h-3 w-3 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-zinc-500" />
                  )}
                </button>

                {showThinking && (
                  <div className="px-3.5 pb-3 pt-2 text-xs text-zinc-400 font-mono whitespace-pre-wrap border-t border-zinc-800/60 bg-zinc-950/60 max-h-56 overflow-y-auto leading-relaxed">
                    {message.thinking_process}
                  </div>
                )}
              </div>
            )}

            {/* Synthesized Response Body */}
            <div className="prose prose-invert max-w-none text-zinc-200 text-[13.5px] leading-relaxed tracking-normal font-sans">
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

            {/* Clickable Citations */}
            {message.sources && message.sources.length > 0 && (
              <div className="pt-2 mt-4 border-t border-zinc-800/60 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-full mb-0.5">
                  Referenced Sources:
                </span>
                {message.sources.map((src, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => onSelectCitation && onSelectCitation(src.doc_name, src.page_number)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/40 text-amber-300 hover:text-amber-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer group"
                  >
                    <FileText className="h-3 w-3 text-amber-400 shrink-0 group-hover:scale-105 transition-transform" />
                    <span className="truncate max-w-[200px]">{src.doc_name}</span>
                    <span className="text-zinc-500 text-[10px]">p.{src.page_number}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Message Telemetry Badge */}
            {message.meta && (
              <div className="flex items-center gap-2 pt-1 text-[10px] text-zinc-500 font-mono">
                {message.meta.responseTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5 text-zinc-500" />
                    <span>{message.meta.responseTime}</span>
                  </span>
                )}
                {message.meta.tokens && (
                  <span className="flex items-center gap-1">
                    <Cpu className="h-2.5 w-2.5 text-zinc-500" />
                    <span>{message.meta.tokens} tokens</span>
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          /* User Prompt Bubble */
          <div className="flex justify-end items-start gap-2.5">
            <div className="bg-zinc-800 text-zinc-100 border border-zinc-700/60 font-normal px-4 py-2.5 rounded-2xl shadow-sm text-[13.5px] max-w-lg whitespace-pre-wrap leading-relaxed">
              {message.text}
            </div>
            <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 shrink-0 mt-0.5">
              <User className="h-3.5 w-3.5" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}