import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { GraduationCap, User, FileText, Brain, ChevronDown, ChevronRight } from 'lucide-react';

export default function ChatMessage({ message, onSelectCitation }) {
  const [showThinking, setShowThinking] = useState(false);
  const isBot = message.sender === 'bot';

  return (
    <div className={`flex gap-4 ${isBot ? 'justify-start' : 'justify-end'} w-full`}>
      {/* Bot Avatar */}
      {isBot && (
        <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-1">
          <GraduationCap className="h-4 w-4" />
        </div>
      )}

      {/* Message Content Container */}
      <div className={`w-full max-w-3xl ${isBot ? 'pr-4' : ''}`}>
        {isBot ? (
          <div className="space-y-4">
            {/* Thinking Accordion */}
            {message.thinking_process && (
              <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/70 shadow-md">
                <button
                  type="button"
                  onClick={() => setShowThinking((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors bg-zinc-900/40 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                    <span className="font-sans">Thinking Process</span>
                  </div>
                  {showThinking ? (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                  )}
                </button>

                {showThinking && (
                  <div className="px-4 pb-3.5 pt-2 text-xs text-zinc-400 font-mono whitespace-pre-wrap border-t border-zinc-800/60 bg-zinc-950/90 max-h-60 overflow-y-auto leading-relaxed">
                    {message.thinking_process}
                  </div>
                )}
              </div>
            )}

            {/* Synthesized Response Body */}
            <div className="prose prose-invert max-w-none text-zinc-200 text-sm sm:text-[15px] leading-relaxed tracking-wide">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-lg font-bold text-zinc-100 mt-6 mb-3 tracking-tight border-b border-zinc-800/80 pb-2">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base font-semibold text-amber-400 mt-6 mb-2 tracking-tight">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-zinc-200 mt-4 mb-2 tracking-wide">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-zinc-300 leading-relaxed mb-4 font-normal">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside space-y-2 pl-5 my-3 text-zinc-300">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside space-y-2 pl-5 my-3 text-zinc-300">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="pl-1 leading-relaxed">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-zinc-100">{children}</strong>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-amber-400/80 pl-4 py-1 my-4 bg-amber-500/5 rounded-r-xl italic text-zinc-400">
                      {children}
                    </blockquote>
                  ),

                  /* --- Native GFM Table Renderers --- */
                  table: ({ children }) => (
                    <div className="my-6 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 shadow-xl">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs sm:text-sm">
                          {children}
                        </table>
                      </div>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-zinc-900/90 border-b border-zinc-800 text-[11px] uppercase tracking-wider text-amber-400 font-semibold">
                      {children}
                    </thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-zinc-800/60 font-normal text-zinc-300">
                      {children}
                    </tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="hover:bg-zinc-900/40 transition-colors">
                      {children}
                    </tr>
                  ),
                  th: ({ children }) => (
                    <th className="py-3 px-4 font-semibold text-amber-400 text-left">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="py-3 px-4 leading-relaxed align-top">
                      {children}
                    </td>
                  ),

                  /* --- Code & Pre Blocks --- */
                  code: ({ inline, className, children, ...props }) => {
                    return inline ? (
                      <code className="bg-zinc-900 text-amber-300 font-mono text-[12px] px-1.5 py-0.5 rounded border border-zinc-800" {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="font-mono text-xs text-zinc-200 block overflow-x-auto whitespace-pre-wrap" {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <div className="my-4 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3.5 overflow-x-auto font-mono text-xs leading-relaxed text-zinc-200">
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
              <div className="pt-4 mt-6 border-t border-zinc-800/60 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 w-full mb-1">
                  Referenced Context Sources:
                </span>
                {message.sources.map((src, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => onSelectCitation && onSelectCitation(src.doc_name, src.page_number)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-amber-300 hover:text-amber-400 px-2.5 py-1 rounded-lg transition-all cursor-pointer group"
                  >
                    <FileText className="h-3 w-3 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                    <span>{src.doc_name}</span>
                    <span className="text-zinc-500">(p.{src.page_number})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* User Prompt Bubble */
          <div className="flex justify-end items-start gap-3">
            <div className="bg-amber-400 text-zinc-950 font-medium px-5 py-3 rounded-2xl shadow-md text-sm max-w-xl whitespace-pre-wrap">
              {message.text}
            </div>
            <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
              <User className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}